import {useRef} from 'react';
import {ChangeNotifier, useNotifier} from '../utils/changeNotifier';
import {
  clearNomineeAddressesWhenUnchecked,
  clearUserAddressCache,
  evaluateConditionalFlow,
  evaluateConditionalFlowForField,
  getEditableFields,
  getWatchedFields,
  isApiFieldPlaceholderValue,
  isCheckboxCheckedValue,
  isKycChoiceFieldType,
  isNomineeAddressTargetField,
  isNomineeSameAsMyAddressCheckbox,
  looksLikePrepopulateSourceKey,
  refreshUserAddressCache,
  resolveApiFieldSeedValue,
  resolveNomineeSameAsAddressGroups,
  syncNomineeAddressFromSameAsCheckbox,
} from '../utils/conditionalFlow';
import {AnyMap, isMap, toStr} from '../utils/dartHelpers';
import {debugPrint} from '../utils/debug';
import {
  applyExtraNomineeFieldState,
  clampNomineePercentageValue,
  clearLockedPriorNomineeAllocatedPercent,
  clearNomineeSyncProtectedEditableOverrides,
  isAdditionalNomineeAddCheckbox,
  isAdditionalNomineeKycStep,
  isExtraNomineeDropdownVisible,
  isNomineeExtendedUiStep,
  isNomineeKycStep,
  isNomineePercentageFieldName,
  isNomineeProofTypeField,
  isNomineeSyncProtectedFormField,
  kAddNomineeField,
  kAddSecondNomineeField,
  kAddThirdNomineeField,
  kExtraNomineeField,
  lockPriorNomineeAllocatedPercentForStep,
  seedAddNomineeFieldDefaultNo,
  seedBpWealthPersonalDetailsPepAndTaxDefaultsNo,
  shouldRunNomineeRealtimeUiSync,
  syncAdditionalNomineeStepSideEffects,
  syncNomineePercentageSideEffects,
  validateAdditionalNomineePercentageTotal,
  validateFieldWithConditions,
  validateFormWithConditions,
  validateNomineePercentageTotal,
} from '../utils/fieldValidators';
import {isAadharImageFieldName} from '../utils/conditionalFlow';

export const validationMaxLengths: Record<string, number> = {
  ifsc: 11,
  bank: 18,
  aadhar: 12,
  mobile: 10,
  pan: 10,
  aadhaar: 12,
  email: 30,
  pincode: 6,
  account_number: 18,
  username: 20,
};

/** Dart `listEquals`: element-wise `==` (reference equality for maps). */
function listEquals(a: any[] | null | undefined, b: any[] | null | undefined): boolean {
  if (a == null) return b == null;
  if (b == null || a.length !== b.length) return false;
  if (a === b) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class ConditionalFormNotifier extends ChangeNotifier {
  formData: AnyMap = {};
  errors: Record<string, string> = {};
  /** Form-level message for toast only (not shown under any field). */
  validationToastMessage: string | null = null;
  fieldVisibility: Record<string, boolean> = {};
  fieldEditable: Record<string, boolean> = {};
  private _fields: any[] | null | undefined;
  private _conditionalFlow: any[] | null | undefined;
  private _fieldsWithAuthSnapshot: any;
  private _lastStableAddNomineeRefreshKey: string | null = null;

  get fields(): any[] | null | undefined {
    return this._fields;
  }

  get conditionalFlow(): any[] | null | undefined {
    return this._conditionalFlow;
  }

  constructor(opts: {fields?: any[] | null; conditionalFlow?: any[] | null} = {}) {
    super();
    this._fields = opts.fields;
    this._conditionalFlow = opts.conditionalFlow;
  }

  private _ctx(): any {
    const snap = this._fieldsWithAuthSnapshot;
    return isMap(snap) ? snap.context : undefined;
  }

  private _stepPos(): string | undefined {
    const v = this._ctx()?.position;
    return v == null ? undefined : toStr(v);
  }

  private _stepLbl(): string | undefined {
    const v = this._ctx()?.page?.data?.label;
    return v == null ? undefined : toStr(v);
  }

  updateFields(
    fields: any[] | null | undefined,
    conditionalFlow: any[] | null | undefined,
    options: {fieldsWithAuth?: any; replaceFormData?: boolean} = {},
  ): void {
    const {fieldsWithAuth} = options;
    const replaceFormData = options.replaceFormData ?? false;
    if (replaceFormData) {
      clearLockedPriorNomineeAllocatedPercent();
      this.formData = {};
      this.errors = {};
      this.validationToastMessage = null;
      this.fieldVisibility = {};
      this.fieldEditable = {};
      clearUserAddressCache();
      this._lastStableAddNomineeRefreshKey = null;
    }
    const fieldsChanged =
      replaceFormData ||
      !listEquals(this._fields, fields) ||
      !listEquals(this._conditionalFlow, conditionalFlow);
    this._fields = fields;
    this._conditionalFlow = conditionalFlow;
    if (fieldsWithAuth != null) this._fieldsWithAuthSnapshot = fieldsWithAuth;

    if (fieldsChanged && fields != null) {
      this._lastStableAddNomineeRefreshKey = null;
      // Fresh step/context should not inherit stale show/hide/edit flags.
      this.fieldVisibility = {};
      this.fieldEditable = {};

      // Set initial field values from API (value → literal prepopulate → defaultValue).
      // `prepopulateValue` source mappings (reverse_*, [{label,value}]) are never seeded.
      for (const f of fields) {
        if (isMap(f) && f.name != null) {
          const name = f.name;
          const type = f.type == null ? '' : toStr(f.type).toLowerCase();
          const val = resolveApiFieldSeedValue(f);
          const current = this.formData[name];
          const isChoiceOrCheckbox = type === 'checkbox' || isKycChoiceFieldType(type);

          // Drop stale source-key / mapping values left from older seeds.
          if (Array.isArray(current) || isMap(current)) {
            delete this.formData[name];
          } else if (
            typeof current === 'string' &&
            looksLikePrepopulateSourceKey(current) &&
            !isChoiceOrCheckbox
          ) {
            delete this.formData[name];
          }

          if (val == null) continue;
          const refreshed = this.formData[name];
          // User cleared a free-text field — keep blank; choice/checkbox may still take defaultValue.
          if (
            name in this.formData &&
            typeof refreshed === 'string' &&
            refreshed.trim().length === 0 &&
            !isChoiceOrCheckbox
          ) {
            continue;
          }
          // First paint / missing key: merge dropoff from API.
          const unset =
            refreshed == null ||
            (typeof refreshed === 'string' && refreshed.trim().length === 0) ||
            isApiFieldPlaceholderValue(refreshed);
          const forceApiValueField =
            name === kAddSecondNomineeField ||
            name === kAddThirdNomineeField ||
            name === kAddNomineeField;
          if (!(name in this.formData) || unset || forceApiValueField) {
            this.formData[name] = type === 'checkbox' ? isCheckboxCheckedValue(val) : val;
          } else if (isAadharImageFieldName(name == null ? null : toStr(name))) {
            // DigiLocker photo URL must track latest get-context / user-details.
            const incoming = val == null ? '' : toStr(val).trim();
            if (incoming.startsWith('http')) {
              const cur = this.formData[name] == null ? '' : toStr(this.formData[name]).trim();
              if (incoming !== cur) this.formData[name] = val;
            }
          }
        }
      }

      refreshUserAddressCache({
        formData: this.formData,
        fieldsWithAuth: this._fieldsWithAuthSnapshot ?? fieldsWithAuth,
        stepFields: fields,
      });

      // Nominee address: only keep values when "same as my address" is checked.
      clearNomineeAddressesWhenUnchecked(this.formData, {stepFields: fields});

      const ctx = this._ctx();
      const stepPos = this._stepPos();
      const stepLbl = this._stepLbl();
      seedAddNomineeFieldDefaultNo({
        formData: this.formData,
        fields,
        position: stepPos,
        pageLabel: stepLbl,
      });
      const company = isMap(ctx) && ctx.company != null ? toStr(ctx.company) : undefined;
      seedBpWealthPersonalDetailsPepAndTaxDefaultsNo({
        formData: this.formData,
        fields,
        company,
        position: stepPos,
        pageLabel: stepLbl,
      });

      // Apply initial conditional flow for all fields with values
      // This ensures correct initial visibility based on pre-filled data
      debugPrint(
        `[ConditionalForm] Applying initial conditional flow for ${this.watchedFields.length} watched fields`,
      );
      for (const watchedField of this.watchedFields) {
        if (isNomineeSameAsMyAddressCheckbox(watchedField)) continue;
        const fieldValue = this.formData[watchedField];
        // Evaluate if field has a truthy value OR if it's explicitly false/empty (for checkbox "No" cases)
        if (
          watchedField in this.formData &&
          (fieldValue != null || fieldValue === false || fieldValue === '')
        ) {
          debugPrint(
            `[ConditionalForm] Evaluating initial state for: ${watchedField} = ${this.formData[watchedField]}`,
          );
          this._applyConditionalLogic(watchedField);
        }
      }

      const sameAsGroups = resolveNomineeSameAsAddressGroups(fields);
      for (const key of Object.keys(sameAsGroups)) {
        if (isCheckboxCheckedValue(this.formData[key])) {
          syncNomineeAddressFromSameAsCheckbox(this.formData, key, this.formData[key], {
            stepFields: fields,
            fieldsWithAuth: this._fieldsWithAuthSnapshot ?? fieldsWithAuth,
          });
        }
      }

      if (isAdditionalNomineeKycStep(stepPos, stepLbl)) {
        lockPriorNomineeAllocatedPercentForStep(fields, {
          position: stepPos,
          pageLabel: stepLbl,
        });
      } else {
        clearLockedPriorNomineeAllocatedPercent();
      }
      this._runNomineeRealtimeUiSync({position: stepPos, pageLabel: stepLbl});

      // Only notify listeners if fields actually changed
      this.notifyListeners();
    }
    // Refresh on same step can keep stale visibility when fields list is unchanged.
    // Re-evaluate add_nominee state so No keeps nominee block closed.
    if (!fieldsChanged && fields != null) {
      const hasAddNomineeWatcher = this.watchedFields.includes(kAddNomineeField);
      if (hasAddNomineeWatcher && kAddNomineeField in this.formData) {
        const stepPos = this._stepPos() ?? '';
        const stepLbl = this._stepLbl() ?? '';
        const addNomineeVal =
          this.formData[kAddNomineeField] == null ? '' : toStr(this.formData[kAddNomineeField]);
        const refreshKey = `${stepPos}|${stepLbl}|${addNomineeVal}`;
        if (this._lastStableAddNomineeRefreshKey === refreshKey) {
          return;
        }
        this._lastStableAddNomineeRefreshKey = refreshKey;
        this._applyConditionalLogic(kAddNomineeField);
        this._runNomineeRealtimeUiSync({
          position: stepPos,
          pageLabel: stepLbl,
          changedFieldName: kAddNomineeField,
        });
        this.notifyListeners();
      }
    }
  }

  get watchedFields(): string[] {
    return getWatchedFields(this._conditionalFlow);
  }

  /** Re-run conditional flow for all watched fields (e.g. after penny drop failed proceed). */
  reapplyInitialConditionalFlow(): void {
    const fields = this._fields;
    if (fields == null) return;
    debugPrint(
      `[ConditionalForm] Reapplying conditional flow for ${this.watchedFields.length} watched fields`,
    );
    for (const watchedField of this.watchedFields) {
      if (isNomineeSameAsMyAddressCheckbox(watchedField)) continue;
      const fieldValue = this.formData[watchedField];
      if (
        watchedField in this.formData &&
        (fieldValue != null || fieldValue === false || fieldValue === '')
      ) {
        this._applyConditionalLogic(watchedField);
      }
    }
    this.notifyListeners();
  }

  /** Full conditional-flow pass (same as submit validation) - reveals bank_upload etc. */
  applyFullConditionalFlowEvaluation(): void {
    const state = evaluateConditionalFlow(this._conditionalFlow, this.formData);
    Object.assign(this.fieldVisibility, state.fieldVisibility);
    Object.assign(this.fieldEditable, state.fieldEditable);
    this.notifyListeners();
  }

  resetForm(): void {
    clearLockedPriorNomineeAllocatedPercent();
    this.formData = {};
    this.errors = {};
    this.validationToastMessage = null;
    this.fieldVisibility = {};
    this.fieldEditable = {};
    clearUserAddressCache();
    this._fieldsWithAuthSnapshot = null;
    this._lastStableAddNomineeRefreshKey = null;
    this.notifyListeners();
  }

  /**
   * Writes [updates] into [formData] as-is (no [_processValue] / length caps) and notifies.
   * Used for IFSC lookup auto-fill so long bank addresses are not truncated like [handleChange].
   */
  applyExternalFormValues(updates: AnyMap): void {
    for (const k of Object.keys(updates)) {
      this.formData[k] = updates[k];
    }
    this.notifyListeners();
  }

  private _processValue(
    name: string,
    value: any,
    type: string,
    validationType?: string | null,
    _validateWith?: string | null,
  ): string {
    // BugFixes: dropdown (select) values must not be truncated like generic text.
    if (type === 'checkbox' || type === 'file' || type === 'select') {
      return toStr(value);
    }
    let processed = toStr(value);
    const nl = name.toLowerCase();
    const effectiveValidation = ((): string | null | undefined => {
      const vt = validationType == null ? null : toStr(validationType).trim();
      if (vt != null && vt.length > 0 && vt.toLowerCase() !== 'no') {
        return vt.toLowerCase();
      }
      if (nl === 'pan_number' || nl === 'temp_pan_no' || nl === 'pan_no') {
        return 'pan';
      }
      return vt == null ? null : vt.toLowerCase();
    })();

    switch (effectiveValidation) {
      case 'mobile':
      case 'aadhaar':
      case 'pincode':
      case 'otp':
        processed = processed.replace(/\D/g, '');
        break;
      case 'pan':
      case 'ifsc':
        processed = processed.toUpperCase().replace(/[^A-Z0-9]/g, '');
        break;
      case 'bank':
        processed = processed.replace(/\D/g, '');
        break;
      case 'name':
        processed = processed.replace(/[^a-zA-Z\s]/g, '');
        break;
      case 'nospecialcharacter':
        processed = processed.replace(/[^a-zA-Z\s'\-]/g, '');
        break;
      default:
        break;
    }
    const cap = validationMaxLengths[effectiveValidation ?? ''] ?? 35;
    if (processed.length > cap) processed = processed.substring(0, cap);
    return processed;
  }

  handleChange(
    name: string,
    value: any,
    options: {type?: string; validationType?: string | null; validateWith?: string | null} = {},
  ): void {
    const type = options.type ?? 'text';
    const {validationType, validateWith} = options;
    let processedValue = value;
    if (type !== 'checkbox' && type !== 'file' && value != null) {
      processedValue = this._processValue(name, value, type, validationType, validateWith);
    }
    if (type === 'checkbox') {
      processedValue = isCheckboxCheckedValue(processedValue);
    }

    const stepPos = this._stepPos();
    const stepLbl = this._stepLbl();
    if (isNomineeExtendedUiStep(stepPos, stepLbl) && isNomineePercentageFieldName(name)) {
      // Nominee share accepts integers only (no decimal input like 0.10 / .20).
      if (processedValue != null) {
        const raw = toStr(processedValue);
        const digitsOnly = raw.replace(/[^0-9]/g, '');
        processedValue = digitsOnly;
      }
      const clamped = clampNomineePercentageValue({
        fieldName: name,
        rawValue: processedValue,
        formData: this.formData,
        fields: this._fields,
        runtimeFieldVisibility: this.fieldVisibility,
        position: stepPos,
        pageLabel: stepLbl,
      });
      if (clamped != null) processedValue = clamped;
    }

    this.formData[name] = processedValue;

    refreshUserAddressCache({
      formData: this.formData,
      fieldsWithAuth: this._fieldsWithAuthSnapshot,
      stepFields: this._fields,
    });

    if (validateWith != null && validateWith.length > 0 && value !== this.formData[validateWith]) {
      // Get displayName from the validateWith field if available, otherwise format the key
      let label = validateWith.replace(/_/g, ' ');
      // Try to find the validateWith field in _fields to get its displayName
      const validateWithField = this._fields?.find(
        f => f != null && f.name != null && toStr(f.name) === validateWith,
      );
      if (validateWithField != null && validateWithField.displayName != null) {
        label = toStr(validateWithField.displayName);
      } else {
        // Capitalize first letter of each word for better readability
        label = label
          .split(' ')
          .map(word => (word.length === 0 ? '' : word[0].toUpperCase() + word.substring(1).toLowerCase()))
          .join(' ');
      }
      this.errors[name] = `Value should be same as ${label}`;
    } else {
      delete this.errors[name];
    }
    this._applyConditionalLogic(name);

    if (isNomineeExtendedUiStep(stepPos, stepLbl) && shouldRunNomineeRealtimeUiSync(name)) {
      this._runNomineeRealtimeUiSync({
        position: stepPos,
        pageLabel: stepLbl,
        changedFieldName: name,
      });
    }

    // After conditional + nominee UI sync - fill address last so nothing clears it.
    if (isNomineeSameAsMyAddressCheckbox(name)) {
      syncNomineeAddressFromSameAsCheckbox(this.formData, name, this.formData[name], {
        stepFields: this._fields,
        fieldsWithAuth: this._fieldsWithAuthSnapshot,
      });
    }

    this.notifyListeners();
  }

  private _runNomineeRealtimeUiSync(opts: {
    position?: string | null;
    pageLabel?: string | null;
    changedFieldName?: string | null;
  }): void {
    const {position, pageLabel, changedFieldName} = opts;
    if (isNomineeKycStep(position, pageLabel)) {
      if (
        changedFieldName != null &&
        this.watchedFields.includes(changedFieldName) &&
        isNomineeProofTypeField(changedFieldName)
      ) {
        this._applyConditionalLogic(changedFieldName);
      }
      this._syncNomineePercentageFromContext({position, pageLabel});
      this._clearNomineeProtectedEditableOverrides();
    } else if (isAdditionalNomineeKycStep(position, pageLabel)) {
      if (
        changedFieldName != null &&
        this.watchedFields.includes(changedFieldName) &&
        (isAdditionalNomineeAddCheckbox(changedFieldName) ||
          isNomineePercentageFieldName(changedFieldName) ||
          isNomineeProofTypeField(changedFieldName) ||
          isNomineeSameAsMyAddressCheckbox(changedFieldName) ||
          (changedFieldName.toLowerCase().includes('nominee') &&
            changedFieldName.toLowerCase().includes('dob')))
      ) {
        this._applyConditionalLogic(changedFieldName);
      }
      syncAdditionalNomineeStepSideEffects({
        formData: this.formData,
        fields: this._fields,
        runtimeFieldVisibility: this.fieldVisibility,
        fieldEditable: this.fieldEditable,
        position,
        pageLabel,
      });
      return;
    } else {
      return;
    }

    if (!isNomineeKycStep(position, pageLabel)) return;

    // Percentage typing: sync only - re-running `add_nominee` was resetting add_2 / % input.
    const reapplyConditional =
      changedFieldName === kAddSecondNomineeField ||
      changedFieldName === kAddThirdNomineeField ||
      changedFieldName === kExtraNomineeField;
    if (reapplyConditional && changedFieldName != null && this.watchedFields.includes(changedFieldName)) {
      this._applyConditionalLogic(changedFieldName);
      this._syncNomineePercentageFromContext({position, pageLabel});
      this._clearNomineeProtectedEditableOverrides();
    }
  }

  private _clearNomineeProtectedEditableOverrides(): void {
    const stepPos = this._stepPos();
    const stepLbl = this._stepLbl();
    if (!isNomineeKycStep(stepPos, stepLbl)) return;
    clearNomineeSyncProtectedEditableOverrides({
      fieldEditable: this.fieldEditable,
      fields: this._fields,
    });
  }

  private _syncNomineePercentageFromContext(opts: {
    company?: string | null;
    position?: string | null;
    pageLabel?: string | null;
  }): void {
    const {company, position, pageLabel} = opts;
    syncNomineePercentageSideEffects({
      formData: this.formData,
      fieldEditable: this.fieldEditable,
      fields: this._fields,
      runtimeFieldVisibility: this.fieldVisibility,
      company,
      position: position ?? this._stepPos(),
      pageLabel: pageLabel ?? this._stepLbl(),
    });
  }

  /** Conditional `true`/`false` actions must not write booleans into text fields. */
  private _sanitizeConditionalFormValue(fieldName: string, value: any): any {
    if (typeof value !== 'boolean') return value;
    const field = this._fields?.find(f => f != null && f.name != null && toStr(f.name) === fieldName);
    if (field == null) return value;
    const type = (field.type == null ? '' : toStr(field.type)).toLowerCase();
    if (type === 'text' || type === 'textarea' || type === 'number' || type === 'password') {
      return '';
    }
    return value;
  }

  private _applyConditionalLogic(fieldName: string): void {
    if (!this.watchedFields.includes(fieldName)) return;

    const stepPos = this._stepPos();
    const stepLbl = this._stepLbl();
    const onNominee = isNomineeExtendedUiStep(stepPos, stepLbl);

    debugPrint(`[ConditionalForm] Applying logic for: ${fieldName} = ${this.formData[fieldName]}`);
    const state = evaluateConditionalFlowForField(this._conditionalFlow, this.formData, fieldName);

    // Update field visibility (show/hide actions)
    if (Object.keys(state.fieldVisibility).length > 0) {
      debugPrint(`[ConditionalForm] Visibility changes: ${JSON.stringify(state.fieldVisibility)}`);
      Object.assign(this.fieldVisibility, state.fieldVisibility);

      // Debug: Show which fields are now visible
      const vals = Object.values(this.fieldVisibility);
      const visibleCount = vals.filter(v => v === true).length;
      const hiddenCount = vals.filter(v => v === false).length;
      debugPrint(`[ConditionalForm] After update: ${visibleCount} visible, ${hiddenCount} hidden`);
    }

    // Update field editable state (enable/disable actions)
    if (Object.keys(state.fieldEditable).length > 0) {
      debugPrint(`[ConditionalForm] Editable changes: ${JSON.stringify(state.fieldEditable)}`);
      for (const key of Object.keys(state.fieldEditable)) {
        if (onNominee && isNomineeSyncProtectedFormField(key)) continue;
        this.fieldEditable[key] = state.fieldEditable[key];
      }
    }

    // Update form data (empty, prePopulate, true, false actions)
    for (const key of Object.keys(state.formData)) {
      const value = state.formData[key];
      if (key === fieldName || this.formData[key] === value) continue;
      // Nominee address copy/clear is handled only via same-as checkbox sync.
      if (isNomineeAddressTargetField(key)) continue;
      if (onNominee && isNomineeSyncProtectedFormField(key)) continue;
      if (
        onNominee &&
        key === kExtraNomineeField &&
        !isExtraNomineeDropdownVisible({
          formData: this.formData,
          fields: this._fields,
          runtimeFieldVisibility: this.fieldVisibility,
          position: stepPos,
          pageLabel: stepLbl,
        })
      ) {
        continue;
      }
      debugPrint(`[ConditionalForm] Action updated field: ${key} = ${value}`);
      this.formData[key] = this._sanitizeConditionalFormValue(key, value);
    }

    if (onNominee) {
      applyExtraNomineeFieldState({
        formData: this.formData,
        fields: this._fields,
        runtimeFieldVisibility: this.fieldVisibility,
        fieldEditable: this.fieldEditable,
        position: stepPos,
        pageLabel: stepLbl,
      });
      this._clearNomineeProtectedEditableOverrides();
    }
  }

  handleBlur(fieldName: string, options: {position?: string | null; pageLabel?: string | null} = {}): void {
    const {position, pageLabel} = options;
    const field = this._fields?.find(f => f != null && f.name === fieldName);
    if (field == null) return;

    if (
      isNomineeExtendedUiStep(position, pageLabel) &&
      (isNomineePercentageFieldName(fieldName) ||
        (fieldName.toLowerCase().includes('nominee') && fieldName.toLowerCase().includes('dob')))
    ) {
      this._runNomineeRealtimeUiSync({
        position,
        pageLabel,
        changedFieldName: fieldName,
      });
    }

    const fieldErrors = validateFieldWithConditions(
      field,
      this.formData[fieldName],
      this.formData,
      this._conditionalFlow,
      {position, pageLabel},
    );
    if (fieldErrors.length > 0) {
      this.errors[fieldName] = fieldErrors[0];
    } else {
      delete this.errors[fieldName];
    }
    this.notifyListeners();
  }

  validate(options: {company?: string | null; position?: string | null; pageLabel?: string | null} = {}): boolean {
    const {company, position, pageLabel} = options;
    this.validationToastMessage = null;
    const stepPos = position ?? this._stepPos();
    const stepLbl = pageLabel ?? this._stepLbl();
    if (isNomineeKycStep(stepPos, stepLbl)) {
      this._syncNomineePercentageFromContext({company, position: stepPos, pageLabel: stepLbl});
    } else if (isAdditionalNomineeKycStep(stepPos, stepLbl)) {
      syncAdditionalNomineeStepSideEffects({
        formData: this.formData,
        fields: this._fields,
        runtimeFieldVisibility: this.fieldVisibility,
        fieldEditable: this.fieldEditable,
        position: stepPos,
        pageLabel: stepLbl,
      });
    }

    this.errors = validateFormWithConditions(this._fields, this.formData, this._conditionalFlow, {
      company,
      position: stepPos,
      pageLabel: stepLbl,
      runtimeFieldVisibility: this.fieldVisibility,
    });

    let nomineePctError: string | null = null;
    if (isNomineeKycStep(stepPos, stepLbl)) {
      nomineePctError = validateNomineePercentageTotal({
        fields: this._fields,
        formData: this.formData,
        runtimeFieldVisibility: this.fieldVisibility,
        company,
        position: stepPos,
        pageLabel: stepLbl,
      });
    } else if (isAdditionalNomineeKycStep(stepPos, stepLbl)) {
      nomineePctError = validateAdditionalNomineePercentageTotal({
        fields: this._fields,
        formData: this.formData,
        runtimeFieldVisibility: this.fieldVisibility,
        company,
        position: stepPos,
        pageLabel: stepLbl,
      });
    }
    if (nomineePctError != null) {
      this.validationToastMessage = nomineePctError;
      this.notifyListeners();
      return false;
    }

    this.notifyListeners();
    return Object.keys(this.errors).length === 0;
  }

  get editableFieldsList(): any[] {
    return getEditableFields(this._fields ?? [], this.fieldEditable);
  }
}

/** Creates a stable ConditionalFormNotifier for the component and subscribes to its updates. */
export function useConditionalForm(): ConditionalFormNotifier {
  const ref = useRef<ConditionalFormNotifier | null>(null);
  if (ref.current == null) ref.current = new ConditionalFormNotifier();
  return useNotifier(ref.current);
}
