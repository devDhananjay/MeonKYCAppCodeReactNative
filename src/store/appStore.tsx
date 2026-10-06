import React, {createContext, useContext, useRef} from 'react';
import {ApiClient} from '../api/apiClient';
import {HttpResponse} from '../api/http';
import {KycAPI} from '../api/kycApi';
import {ChangeNotifier, useNotifier} from '../utils/changeNotifier';
import {AnyMap, delay, isMap, splitQueryString, toStr} from '../utils/dartHelpers';
import {debugPrint} from '../utils/debug';
import {
  friendlyApiErrorMessage,
  isInvalidPanContextError,
  isPdfDocumentEncryptedError,
} from '../utils/apiErrorMessage';

function _isGenericHtml500(body: string): boolean {
  const t = body.trim().toLowerCase();
  return t.includes('<html') && t.includes('internal server error');
}

function _parseJson(body: string): any {
  try {
    return JSON.parse(body);
  } catch (_) {
    return null;
  }
}

const _hiddenStepperSteps = new Set<string>(['cdsl_upload', 'nse', 'bse', 'kra_new', 'backoffice']);

function _sortStepperKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const aInt = /^[+-]?\d+$/.test(a.trim()) ? parseInt(a.trim(), 10) : null;
    const bInt = /^[+-]?\d+$/.test(b.trim()) ? parseInt(b.trim(), 10) : null;
    if (aInt != null && bInt != null) {
      return aInt - bInt;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function _clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class AppStore extends ChangeNotifier {
  // Params
  private _company: string | null = null;
  private _workflowName: string | null = null;
  get company(): string | null {
    return this._company;
  }
  get workflowName(): string | null {
    return this._workflowName;
  }
  setParams(opts: {company?: string | null; workflowName?: string | null}): void {
    this._company = opts.company ?? this._company;
    this._workflowName = opts.workflowName ?? this._workflowName;
    this.notifyListeners();
  }

  // Workflow (unauthenticated)
  private _fields: any;
  private _loading = false;
  private _error: string | null = null;
  /** Cached for pdfPassCheck / verifyPdfPassword (survives auth/unauth switches). */
  private _workflowKey: string | null = null;

  get fields(): any {
    return this._fields;
  }
  get loading(): boolean {
    return this._loading;
  }
  get error(): string | null {
    return this._error;
  }
  get workflowKey(): string | null {
    return this._workflowKey;
  }

  private _cacheWorkflowKeyFrom(source: any, label: string): void {
    if (!isMap(source)) return;
    for (const key of ['workflow_key', 'id', 'muid']) {
      const raw = source[key];
      const v = raw == null ? null : toStr(raw).trim();
      if (v != null && v.length > 0) {
        this._workflowKey = v;
        debugPrint(`[AppStore] workflowKey cached from ${label}.${key}=${this._workflowKey}`);
        return;
      }
    }
  }

  /** Best-effort resolve for PDF password APIs. */
  resolveWorkflowKey(): string | null {
    if (this._workflowKey != null && this._workflowKey.trim().length > 0) {
      return this._workflowKey.trim();
    }
    const auth = this._fieldsWithAuth;
    if (isMap(auth)) {
      const ctx = auth.context;
      if (isMap(ctx)) {
        const k = ctx.workflow_key == null ? null : toStr(ctx.workflow_key).trim();
        if (k != null && k.length > 0) {
          this._workflowKey = k;
          return k;
        }
      }
      const root = auth.workflow_key == null ? null : toStr(auth.workflow_key).trim();
      if (root != null && root.length > 0) {
        this._workflowKey = root;
        return root;
      }
    }
    const wf = this._fields;
    if (isMap(wf)) {
      for (const key of ['workflow_key', 'id', 'muid']) {
        const k = wf[key] == null ? null : toStr(wf[key]).trim();
        if (k != null && k.length > 0) {
          this._workflowKey = k;
          return k;
        }
      }
    }
    return null;
  }

  async fetchWorkflowFields(urlCompany: string, urlWorkflowName: string): Promise<void> {
    debugPrint(`[AppStore] fetchWorkflowFields START: ${urlCompany} / ${urlWorkflowName}`);
    this._loading = true;
    this._error = null;
    this.notifyListeners();
    try {
      const res = await ApiClient.post(
        `/api/get-workflow-details/${urlCompany}/${urlWorkflowName}`,
        {body: {}},
      );
      debugPrint(`[AppStore] fetchWorkflowFields Response: ${res.statusCode}`);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const data = _parseJson(res.body);
        this._fields = data?.workflow;
        this._cacheWorkflowKeyFrom(this._fields, 'workflow');
        debugPrint(
          `[AppStore] fetchWorkflowFields OK, workflow keys: ${
            isMap(this._fields) ? JSON.stringify(Object.keys(this._fields)) : 'n/a'
          }`,
        );
      } else {
        this._error = friendlyApiErrorMessage(res.body, {statusCode: res.statusCode});
        debugPrint(`[AppStore] fetchWorkflowFields ERROR: ${res.body}`);
      }
    } catch (e) {
      this._error = friendlyApiErrorMessage(String(e));
      debugPrint(`[AppStore] fetchWorkflowFields Exception: ${e}`);
    } finally {
      this._loading = false;
      this.notifyListeners();
      debugPrint('[AppStore] fetchWorkflowFields DONE');
    }
  }

  // Workflow with auth
  private _fieldsWithAuth: any;
  private _loadingWithAuth = false;
  private _errorWithAuth: string | null = null;
  private _lastGetContextStatusCode: number | null = null;
  private _lastGetContextRawBody: string | null = null;
  // Set true in WebViewPage before navigating back to HomePage so the
  // build method can show a full-screen loader through the entire return flow
  // (covers first-frame flash AND the gap between sequential API calls).
  private _isReturningFromWebView = false;
  private _rpdReturn = false;
  private _rpdSuccessReturn = false;

  get fieldsWithAuth(): any {
    return this._fieldsWithAuth;
  }
  get loadingWithAuth(): boolean {
    return this._loadingWithAuth;
  }
  get errorWithAuth(): string | null {
    return this._errorWithAuth;
  }
  get lastGetContextRawBody(): string | null {
    return this._lastGetContextRawBody;
  }
  get isReturningFromWebView(): boolean {
    return this._isReturningFromWebView;
  }
  get rpdReturn(): boolean {
    return this._rpdReturn;
  }
  get rpdSuccessReturn(): boolean {
    return this._rpdSuccessReturn;
  }

  /** True when get-context failed because uploaded PDF is still encrypted/closed. */
  get hasPdfDocumentEncryptedContextError(): boolean {
    return (
      isPdfDocumentEncryptedError(this._lastGetContextRawBody) ||
      isPdfDocumentEncryptedError(this._errorWithAuth)
    );
  }

  /** True when get-context failed with Invalid PAN / KRA PAN errors. */
  get hasInvalidPanContextError(): boolean {
    return (
      isInvalidPanContextError(this._lastGetContextRawBody) ||
      isInvalidPanContextError(this._errorWithAuth)
    );
  }

  /** True when saved token is rejected (e.g. get-context 404 User not found). */
  get invalidUserSession(): boolean {
    const body = (this._lastGetContextRawBody ?? '').toLowerCase();
    const code = this._lastGetContextStatusCode;
    if (code === 401 || code === 403) return true;
    if (code === 404 && body.includes('user not found')) return true;
    if (body.includes('user not found')) return true;
    return false;
  }

  setReturningFromWebView(value: boolean): void {
    this._isReturningFromWebView = value;
    this.notifyListeners();
  }

  setRpdReturn(value: boolean): void {
    this._rpdReturn = value;
    this.notifyListeners();
  }

  setRpdSuccessReturn(value: boolean): void {
    this._rpdSuccessReturn = value;
    this.notifyListeners();
  }

  clearAuthError(): void {
    this._errorWithAuth = null;
    this._lastGetContextRawBody = null;
    this._lastGetContextStatusCode = null;
    this.notifyListeners();
  }

  async fetchWorkflowFieldsWithAuth(
    urlCompany: string,
    urlWorkflowName: string,
    fullQueryString: string,
    options: {postBody?: AnyMap | null} = {},
  ): Promise<void> {
    const {postBody} = options;
    // Normalize query string: remove any leading '?' and rebuild path correctly
    const cleanQuery = fullQueryString.startsWith('?') ? fullQueryString.substring(1) : fullQueryString;

    const fullPath =
      cleanQuery.length === 0
        ? `/api/get-context/${urlCompany}/${urlWorkflowName}`
        : `/api/get-context/${urlCompany}/${urlWorkflowName}?${cleanQuery}`;

    // When `verify=digilocker` is on the URL, backend expects `save: true` in the POST body
    // (query string is unchanged; only JSON body is set).
    const requestBody: AnyMap = {
      ...(postBody != null ? postBody : {}),
      ...(this._rpdReturn ? {rpd_return: true} : {}),
    };
    if (cleanQuery.length > 0) {
      const qp = splitQueryString(cleanQuery);
      if (qp.verify === 'digilocker') {
        requestBody.save = true;
      }
    }

    debugPrint(`[AppStore] fetchWorkflowFieldsWithAuth START: ${fullPath}`);
    this._loadingWithAuth = true;
    this._errorWithAuth = null;
    this._lastGetContextStatusCode = null;
    this._lastGetContextRawBody = null;
    this.notifyListeners();
    try {
      let res: HttpResponse = await ApiClient.post(fullPath, {body: requestBody});
      const maxAttempts = 3;
      for (
        let attempt = 1;
        attempt < maxAttempts && res.statusCode === 500 && _isGenericHtml500(res.body);
        attempt++
      ) {
        const wait = 450 * attempt;
        debugPrint(
          `[AppStore] get-context HTTP 500 (generic HTML) - retry ${attempt}/${maxAttempts} after ${wait}ms`,
        );
        await delay(wait);
        res = await ApiClient.post(fullPath, {body: requestBody});
      }
      debugPrint(`[AppStore] fetchWorkflowFieldsWithAuth Response: ${res.statusCode}`);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const data = _parseJson(res.body);
        const success = isMap(data) && data.success === true;
        if (success) {
          this._fieldsWithAuth = data;

          // Extract Position and Page ID from context for stepper
          if (isMap(data) && 'context' in data) {
            const context = data.context;
            if (isMap(context)) {
              this._cacheWorkflowKeyFrom(context, 'context');
              if ('position' in context) {
                this._currentPosition = context.position == null ? null : toStr(context.position);
                debugPrint(`[AppStore] Position extracted: ${this._currentPosition}`);
              }
              // Extract page.id for duplicate position handling
              if ('page' in context) {
                const page = context.page;
                if (isMap(page) && 'id' in page) {
                  this._currentPageId = page.id == null ? null : toStr(page.id);
                  debugPrint(`[AppStore] Page ID extracted: ${this._currentPageId}`);
                }
              }
            }
          }

          debugPrint('[AppStore] fetchWorkflowFieldsWithAuth OK');
        } else {
          this._lastGetContextStatusCode = res.statusCode;
          this._lastGetContextRawBody = res.body;
          // Extract error message from nested error object first, then fallback to top-level msg
          let errorMsg: string | null = null;
          if (isMap(data)) {
            // Check for nested error.msg first (e.g., "Missing account details...")
            const errorObj = data.error;
            if (isMap(errorObj) && errorObj.msg != null) {
              errorMsg = toStr(errorObj.msg);
            } else {
              // Fallback to top-level msg
              errorMsg = data.msg == null ? null : toStr(data.msg);
            }
          }
          this._errorWithAuth = friendlyApiErrorMessage(errorMsg ?? res.body, {
            statusCode: res.statusCode,
          });
          debugPrint(
            `[AppStore] fetchWorkflowFieldsWithAuth ERROR (success: false): ${this._errorWithAuth}`,
          );
        }
      } else {
        this._lastGetContextStatusCode = res.statusCode;
        this._lastGetContextRawBody = res.body;
        this._errorWithAuth = friendlyApiErrorMessage(res.body, {statusCode: res.statusCode});
        debugPrint(`[AppStore] fetchWorkflowFieldsWithAuth ERROR: ${res.body}`);
      }
    } catch (e) {
      this._errorWithAuth = friendlyApiErrorMessage(String(e));
      debugPrint(`[AppStore] fetchWorkflowFieldsWithAuth Exception: ${e}`);
    } finally {
      this._loadingWithAuth = false;
      this.notifyListeners();
      debugPrint('[AppStore] fetchWorkflowFieldsWithAuth DONE');
    }
  }

  // User details (for KYC Completed page)
  private _userDetails: any;
  private _loadingUserDetails = false;
  private _errorUserDetails: string | null = null;
  get userDetails(): any {
    return this._userDetails;
  }
  get loadingUserDetails(): boolean {
    return this._loadingUserDetails;
  }
  get errorUserDetails(): string | null {
    return this._errorUserDetails;
  }

  async fetchUserDetails(): Promise<void> {
    debugPrint('[AppStore] fetchUserDetails START');
    this._loadingUserDetails = true;
    this._errorUserDetails = null;
    this.notifyListeners();
    try {
      const res = await ApiClient.post('/api/user-details', {body: {}});
      debugPrint(`[AppStore] fetchUserDetails Response: ${res.statusCode}`);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const data = _parseJson(res.body);
        this._userDetails = data;
        debugPrint('[AppStore] fetchUserDetails OK');
      } else {
        this._errorUserDetails = res.body;
        debugPrint(`[AppStore] fetchUserDetails ERROR: ${res.body}`);
      }
    } catch (e) {
      this._errorUserDetails = String(e);
      debugPrint(`[AppStore] fetchUserDetails Exception: ${e}`);
    } finally {
      this._loadingUserDetails = false;
      this.notifyListeners();
      debugPrint('[AppStore] fetchUserDetails DONE');
    }
  }

  // Stepper workflow (dynamic steps from API)
  private _stepperWorkflow: any;
  private _loadingStepperWorkflow = false;
  private _errorStepperWorkflow: string | null = null;
  /** Position from get-context API (e.g., "mobile", "mobile_otp") */
  private _currentPosition: string | null = null;
  /** Page ID from get-context API (e.g., "16", "17") - corresponds to workflow key */
  private _currentPageId: string | null = null;

  get stepperWorkflow(): any {
    return this._stepperWorkflow;
  }
  get loadingStepperWorkflow(): boolean {
    return this._loadingStepperWorkflow;
  }
  get errorStepperWorkflow(): string | null {
    return this._errorStepperWorkflow;
  }
  get currentPosition(): string | null {
    return this._currentPosition;
  }
  get currentPageId(): string | null {
    return this._currentPageId;
  }

  /**
   * Extract data.label list from stepper workflow API response
   * Returns ordered list of label values from data.label
   */
  getStepperSteps(): string[] {
    if (!isMap(this._stepperWorkflow)) return [];

    // Sort by key to maintain order (keys are like "1", "2", "3", etc.)
    const sortedKeys = _sortStepperKeys(Object.keys(this._stepperWorkflow));

    const steps: string[] = [];
    for (const key of sortedKeys) {
      const value = this._stepperWorkflow[key];
      if (isMap(value)) {
        // Extract from data.label (new format)
        const data = isMap(value.data) ? value.data : null;
        if (data != null && 'label' in data) {
          const label = data.label == null ? null : toStr(data.label);
          if (label != null && label.length > 0) {
            steps.push(label);
            continue;
          }
        }
        // Fallback to moduleName (for backward compatibility)
        if ('moduleName' in value) {
          const moduleName = value.moduleName == null ? null : toStr(value.moduleName);
          if (moduleName != null && moduleName.length > 0) {
            steps.push(moduleName);
          }
        }
      }
    }

    return steps.filter(s => !_hiddenStepperSteps.has(s.toLowerCase().trim()));
  }

  /** Maps workflow page key (e.g. "16") to a 0-based step index in [steps]. */
  private _stepIndexFromPageKey(pageKey: string, steps: string[]): number | null {
    if (pageKey.length === 0 || steps.length === 0) return null;

    if (isMap(this._stepperWorkflow) && Object.keys(this._stepperWorkflow).length > 0) {
      const sortedKeys = _sortStepperKeys(Object.keys(this._stepperWorkflow));

      let visibleIndex = -1;
      for (const key of sortedKeys) {
        const workflowValue = this._stepperWorkflow[key];
        if (!isMap(workflowValue)) continue;
        const data = isMap(workflowValue.data) ? workflowValue.data : null;
        const rawLabel =
          data?.label != null
            ? toStr(data.label)
            : workflowValue.moduleName != null
            ? toStr(workflowValue.moduleName)
            : null;
        const label = rawLabel?.toLowerCase().trim() ?? '';
        if (label.length === 0 || _hiddenStepperSteps.has(label)) continue;

        visibleIndex++;
        if (key === pageKey) {
          return _clamp(visibleIndex, 0, steps.length - 1);
        }
      }
    }

    // No stepper metadata (or key missing): workflow keys are 1-based ordinals.
    const keyNum = /^[+-]?\d+$/.test(pageKey.trim()) ? parseInt(pageKey.trim(), 10) : null;
    if (keyNum != null && keyNum >= 1) {
      return _clamp(keyNum - 1, 0, steps.length - 1);
    }
    return null;
  }

  /**
   * Get current step index based on Position and Page ID
   * Returns index of Position in stepper steps, or null if not found
   * IMPORTANT: Current step should NOT be marked as completed, only steps BEFORE it
   * Uses page.id (workflow key) along with position to handle duplicate step names
   */
  getCurrentStepIndex(): number | null {
    if (this._currentPosition == null || this._currentPosition.length === 0) return null;

    const steps = this.getStepperSteps();
    if (steps.length === 0) return null;

    const positionLower = this._currentPosition.toLowerCase().trim();
    const pageId = this._currentPageId?.trim();

    // Priority 1: workflow page id / index (handles duplicate position names)
    if (pageId != null && pageId.length > 0) {
      const fromPage = this._stepIndexFromPageKey(pageId, steps);
      if (fromPage != null) return fromPage;
      return null;
    }

    // Priority 2: Exact match by position (case-insensitive)
    let index = steps.findIndex(step => step.toLowerCase().trim() === positionLower);

    // Priority 3: Step starts with position (e.g., position "mobile" matches step "mobile_otp")
    if (index === -1) {
      index = steps.findIndex(
        step =>
          step.toLowerCase().trim().startsWith(positionLower) ||
          positionLower.startsWith(step.toLowerCase().trim()),
      );
    }

    // Priority 4: Contains match (last resort)
    if (index === -1) {
      index = steps.findIndex(
        step =>
          step.toLowerCase().includes(positionLower) || positionLower.includes(step.toLowerCase()),
      );
    }

    // Index may be -1 if no matching step is found; return null in that case.
    return index === -1 ? null : index;
  }

  /**
   * Fetch stepper workflow metadata.
   * Backend route is: /kycadmin_getWorkflow/{workflowName}/{workflowId}
   */
  async fetchStepperWorkflow(workflowName: string, workflowId: string): Promise<void> {
    debugPrint(`[AppStore] fetchStepperWorkflow START: ${workflowName} / ${workflowId}`);
    this._loadingStepperWorkflow = true;
    this._errorStepperWorkflow = null;
    this.notifyListeners();

    try {
      const res = await KycAPI.getStepperWorkflow(workflowName, workflowId);
      debugPrint(`[AppStore] fetchStepperWorkflow Response: ${res.statusCode}`);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const data = _parseJson(res.body);
        this._stepperWorkflow = data;
        const steps = this.getStepperSteps();
        debugPrint(
          `[AppStore] fetchStepperWorkflow OK - Found ${steps.length} steps: ${JSON.stringify(steps)}`,
        );
      } else {
        this._errorStepperWorkflow = res.body;
        debugPrint(`[AppStore] fetchStepperWorkflow ERROR: ${res.body}`);
      }
    } catch (e) {
      this._errorStepperWorkflow = String(e);
      debugPrint(`[AppStore] fetchStepperWorkflow Exception: ${e}`);
    } finally {
      this._loadingStepperWorkflow = false;
      this.notifyListeners();
      debugPrint('[AppStore] fetchStepperWorkflow DONE');
    }
  }

  /** Reset all state (used after logout) */
  resetState(): void {
    this._fields = null;
    this._fieldsWithAuth = null;
    this._workflowKey = null;
    this._userDetails = null;
    this._stepperWorkflow = null;
    this._currentPosition = null;
    this._currentPageId = null;
    this._loading = false;
    this._loadingWithAuth = false;
    this._loadingUserDetails = false;
    this._loadingStepperWorkflow = false;
    this._error = null;
    this._errorWithAuth = null;
    this._errorUserDetails = null;
    this._errorStepperWorkflow = null;
    this._isReturningFromWebView = false;
    this._rpdReturn = false;
    this._rpdSuccessReturn = false;
    this.notifyListeners();
    debugPrint('[AppStore] State reset');
  }
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({children}: {children: React.ReactNode}) {
  const ref = useRef<AppStore | null>(null);
  if (ref.current == null) ref.current = new AppStore();
  return <AppStoreContext.Provider value={ref.current}>{children}</AppStoreContext.Provider>;
}

/** Equivalent of `context.watch<AppStore>()` - re-renders on every notify. */
export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (store == null) throw new Error('useAppStore must be used inside AppStoreProvider');
  return useNotifier(store);
}

/** Equivalent of `context.read<AppStore>()` - does not subscribe. */
export function useAppStoreRead(): AppStore {
  const store = useContext(AppStoreContext);
  if (store == null) throw new Error('useAppStoreRead must be used inside AppStoreProvider');
  return store;
}
