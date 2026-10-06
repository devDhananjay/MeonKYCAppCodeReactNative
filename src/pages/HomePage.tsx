/* eslint-disable @typescript-eslint/no-unused-vars */
import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {getAuth, signInWithCredential, GoogleAuthProvider} from '@react-native-firebase/auth';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {
  CachesDirectoryPath,
  DocumentDirectoryPath,
  exists,
  mkdir,
  writeFile,
  downloadFile,
  copyFileAssets,
} from '@dr.pogodin/react-native-fs';
import {viewDocument} from '@react-native-documents/viewer';
import {ApiClient} from '../api/apiClient';
import type {HttpResponse} from '../api/http';
import {KycAPI} from '../api/kycApi';
import {LeadSquaredAPI} from '../api/leadsquaredApi';
import {SsoAPI} from '../api/ssoApi';
import {resolveSsoCredentials, kHideOnboardingFormFooter} from '../sso/ssoTempCredentialsGate';
import {
  FormFieldWidget,
  commitPendingDateInputs,
  handleTapOutsideForDateInputs,
} from '../components/FormFieldWidget';
import {AadharImagePreview} from '../components/AadharImagePreview';
import {OtpResendControls} from '../components/OtpVerifySection';
import {ExpansionTile} from '../components/ExpansionTile';
import {BpWealthTariffPdfPreviewDialog} from '../components/BpWealthTariffPdfPreviewDialog';
import {Spinner, IconButton} from '../components/Spinner';
import {goTo, navigationRef} from '../navigation/router';
import {isPickedFile} from '../types/pickedFile';
import type {PickedFile} from '../types/pickedFile';
import {MaterialColors} from '../theme/kycTheme';
import {base64ToBytes} from '../utils/base64';
import {DefaultFirebaseOptions} from '../config/firebaseOptions';
import {KycLayout} from '../components/KycLayout';
import {KycStepperBar} from '../components/KycStepperBar';
import {KycNoteBox} from '../components/KycNoteBox';
import {Loader} from '../components/Loader';
import {NomineeStepSection, OptOutDeclarationDialog} from '../components/NomineeStepSection';
import {OtpVerifySection} from '../components/OtpVerifySection';
import {SegmentsSelection} from '../components/SegmentsSelection';
import {BrokeragePlanDialog} from '../components/BrokeragePlanDialog';
import {MaterialIcon} from '../components/MaterialIcon';
import {ElevatedButton, OutlinedButton, TextButton, KycCheckbox} from '../components/MaterialButtons';
import {AlertDialogView} from '../components/AlertDialogView';
import {EnvConfig} from '../config/env';
import {useConditionalForm} from '../hooks/conditionalForm';
import {useConnectivityRead} from '../services/connectivityController';
import {StorageService} from '../services/storageService';
import {useAppStore} from '../store/appStore';
import {KycTheme} from '../theme/kycTheme';
import {
  friendlyApiErrorMessage,
  invalidPanUserFacingMessage,
  kPdfDocumentEncryptedUserMessage,
} from '../utils/apiErrorMessage';
import * as CF from '../utils/conditionalFlow';
import * as FV from '../utils/fieldValidators';
import * as KD from '../utils/kycDateUtils';
import {AnyMap, delay, isMap, toStr, toStrOrNull, intTryParse} from '../utils/dartHelpers';
import {debugPrint} from '../utils/debug';
import {encodeComponent, uriTryParse} from '../utils/dartUri';
import {Fluttertoast} from '../utils/toast';
import type {AppStore} from '../store/appStore';

interface Props {
  company: string;
  workflowName: string;
  queryParams?: Record<string, string>;
}

const EMPTY_QUERY: Record<string, string> = {};

const RED_700 = '#D32F2F';
const GREEN_700 = '#388E3C';
const GREEN_300 = '#81C784';
const GREEN_900 = '#1B5E20';
const YELLOW_50 = '#FFFDE7';
const YELLOW_200 = '#FFF59D';
const YELLOW_900 = '#F57F17';
const GREY_600 = '#757575';
const GREY_700 = '#616161';
const ORANGE_400 = '#FFA726';
const BP_WEALTH_TARIFF_PDF_ANDROID_ASSET = 'bpwealth_tariff_plan.pdf';

type Timer = ReturnType<typeof setTimeout> | null;

/** Instance fields of Flutter's `_HomePageState`. */
function createFields() {
  return {
    mounted: true,
    submitLoading: false,
    /** While submit is in flight, keep the previous step's fields/values on screen. */
    submitFrozenPage: null as AnyMap | null,
    submitFrozenFormSnapshot: null as AnyMap | null,
    submitFrozenContext: null as AnyMap | null,
    resendOtpLoading: false,
    /** Bumped after successful resend so OtpVerifySection restarts cooldown/expiry timers. */
    otpResendTimerEpoch: 0,
    webViewTransitionActive: false,
    logoutLoading: false,
    /**
     * Non-null when an API call fails while we're returning from WebView.
     * Triggers the retry UI instead of the old step's form UI.
     */
    webViewReturnError: null as string | null,
    /** True while loadWorkflow() is actively running — prevents concurrent calls. */
    loadWorkflowActive: false,
    /** Message shown in the partial loader during WebView return flow. */
    returnFlowMessage: 'Loading your next step...',
    /** One-shot timers: 5 s → slow-network message, 20 s → show retry UI. */
    returnFlowWatchdogTimer: null as Timer,
    /** 5 s periodic: auto-retries loadWorkflow() if stuck with no active call. */
    returnFlowPollingTimer: null as ReturnType<typeof setInterval> | null,
    refreshLoading: false,
    backLoading: false,
    submitError: '',
    submitSuccess: '',
    /** PAN step (`pan10`): last `kyc-post-v2` `msg` / `message` from API (shown on form). */
    panStepApiFeedback: '',
    panStepApiFeedbackIsError: false,
    termsAccepted: true, // Terms & Conditions checkbox (mobile step) — auto-selected
    showTermsError: false, // Show validation message under T&C checkbox
    /** Mobile step: auto-tick Terms & Conditions once per visit. */
    mobileTermsAutoSelectedStepKey: null as string | null,
    /** Nominee landing: ensure No + opt-out checkbox ticked once per visit. */
    nomineeLandingDefaultsStepKey: null as string | null,
    /** `nominee_percentage` step: auto-fill shares to 100% once per visit. */
    nomineePercentageDefaultsStepKey: null as string | null,
    showMobileError: false, // Show error below mobile input when invalid on submit
    googleSignInLoading: false,
    /** One fetch of `/api/user-details` per DigiLocker step visit (fresh Aadhaar photo URL). */
    digilockerUserDetailsFetchStarted: false,
    /** One-shot guard: if we already attempted SSO for this widget instance, don't retry on rebuild. */
    ssoAttempted: false,
    ssoInProgress: false,
    navigatingToKycCompleted: false,
    /**
     * Kept when rehydrating after get-context (see `handleSubmitResponse`): `mobile_otp`
     * resend + header text still know the number (get-context fields often omit it).
     */
    persistedMobileDigitsForOtp: null as string | null,
    persistedEmailForOtp: null as string | null,
    /** Segments step only: user must open brokerage dialog and tap Done — never default-apply. */
    segmentsBrokerageStepKey: null as string | null,
    segmentsBrokerageUserConfirmed: false,
    segmentsBpDefaultsStepKey: null as string | null,
    /** Last good authenticated step — avoids flashing unauth "Start your KYC" during get-context. */
    cachedAuthenticatedPageFields: null as any,
    cachedPageTitle: null as string | null,
    cachedPosition: null as string | null,
    /** Sticky header step name — stays visible during submit until the next step is synced. */
    headerDisplayPosition: null as string | null,
    /** Set when user picks Yes on tax residency; cleared only after they select No. */
    fatcaTaxResidencyMustPickNo: false,
    lastReconnectToken: 0,
    /** Prevents post-frame form sync from re-running on every rebuild (same step). */
    activeFieldsSyncKey: null as string | null,
    /** Max-3 product: auto-submit through unwanted additional_nominee* steps. */
    autoSkipAdditionalNomineeDepth: 0,
    // ---- State that Flutter kept in local dialog routes (modals here are state-driven) ----
    fatcaModalVisible: false,
    ddpiModalVisible: false,
    optOutDeclarationVisible: false,
    pennyDialog: null as null | {
      title: string;
      message: string;
      isVerifiedSuccess: boolean;
      resolve: (v: 'save' | 'retake' | null) => void;
    },
    termsModalVisible: false,
    brokeragePlanDialogVisible: false,
    tariffPdfPreviewVisible: false,
    bpWealthTariffPdfOpening: false,
    /** Latest `FutureBuilder<bool>(StorageService.hasAccessToken())` value. */
    isAuthenticated: false,
  };
}

/** Port of lib/pages/home_page.dart (`HomePage` + `_HomePageState`). */
export function HomePage(props: Props) {
  const queryParams = props.queryParams ?? EMPTY_QUERY;
  const store = useAppStore();
  const connectivity = useConnectivityRead();
  const formNotifier = useConditionalForm();
  const [h] = useState(() => createFields());
  const [, setTick] = useState(0);
  const rerender = () => {
    if (h.mounted) setTick(t => t + 1);
  };
  /** Flutter `setState(() { ... })`. */
  const setState = (fn?: () => void) => {
    fn?.();
    rerender();
  };
  const {height: windowHeight} = useWindowDimensions();
  const widget = props;
  const mounted = () => h.mounted;
  /** Mirrors `widget.queryParams.entries.map(...).join('&')` building (`?a=b&c=d`). */
  const queryStringOf = (m: Record<string, string>): string => {
    const entries = Object.entries(m);
    return entries.length === 0
      ? ''
      : `?${entries.map(([k, v]) => `${k}=${encodeComponent(v)}`).join('&')}`;
  };

  const responseIndicatesKycCompleted = (response: any): boolean => {
    return isMap(response) && response.is_admin === true;
  };

  async function navigateToKycCompletedIfNeeded(s: AppStore): Promise<void> {
    if (!mounted() || !responseIndicatesKycCompleted(s.fieldsWithAuth)) {
      return;
    }
    if (h.navigatingToKycCompleted) return;

    h.navigatingToKycCompleted = true;
    if (mounted()) rerender();

    debugPrint('[HomePage] Navigating to KYC completed page (is_admin=true)');
    try {
      await s.fetchUserDetails();
      if (!mounted()) return;
      if (s.userDetails != null) {
        goTo(`/${widget.company}/${widget.workflowName}/completed`);
        return;
      }
      debugPrint(`[HomePage] KYC completed but user details missing: ${s.errorUserDetails}`);
      if (mounted()) {
        Fluttertoast.showToast({msg: 'Error loading completion details', gravity: 'TOP'});
      }
    } finally {
      if (mounted() && s.userDetails == null) {
        h.navigatingToKycCompleted = false;
        rerender();
      }
    }
  }

  function onInternetRestored(): void {
    if (!mounted()) return;
    if (connectivity.reconnectToken === h.lastReconnectToken) return;
    h.lastReconnectToken = connectivity.reconnectToken;
    if (!connectivity.isConnected) return;
    debugPrint('[HomePage] Internet restored — refreshing workflow');
    void refreshAfterInternetRestored();
  }

  async function refreshAfterInternetRestored(): Promise<void> {
    if (!mounted()) return;
    const queryString = queryStringOf(queryParams);
    const hasToken = await StorageService.hasAccessToken();
    if (!hasToken) {
      void loadWorkflow();
      return;
    }
    const ok = await fetchContextAndRecoverIfNeeded(store, queryString);
    if (!mounted() || !ok) return;
    if (responseIndicatesKycCompleted(store.fieldsWithAuth)) {
      await navigateToKycCompletedIfNeeded(store);
      return;
    }
    const response = store.fieldsWithAuth;
    if (isMap(response)) {
      const ctx = isMap(response.context) ? response.context : null;
      const designTemplate = toStrOrNull(ctx?.design_template);
      if (designTemplate != null && designTemplate.includes('-')) {
        const parts = designTemplate.split('-');
        if (parts.length >= 2) {
          await store.fetchStepperWorkflow(widget.workflowName, parts[1]);
        }
      }
    }
    const activeFields = getActiveFields(store);
    const fieldList = (activeFields?.fields as any[] | null | undefined) ?? [];
    formNotifier.updateFields(fieldList, activeFields?.conditionalFlow as any[] | null | undefined, {
      fieldsWithAuth: store.fieldsWithAuth,
    });
    if (mounted()) rerender();
  }

  // ---------- Return-flow timer helpers ----------

  /**
   * Starts a two-stage watchdog (5 s → slow-network msg, 20 s → retry UI)
   * and a background 5-second polling timer that auto-retries when not active.
   */
  function startReturnFlowTimers(): void {
    if (h.returnFlowWatchdogTimer != null) clearTimeout(h.returnFlowWatchdogTimer);
    if (h.returnFlowPollingTimer != null) clearInterval(h.returnFlowPollingTimer);

    // Stage 1 – 5 seconds: update loading message
    h.returnFlowWatchdogTimer = setTimeout(() => {
      if (!mounted()) return;
      setState(() => {
        h.returnFlowMessage = 'This is taking longer than usual, please wait...';
      });
      debugPrint('[HomePage] Return-flow: slow-network message shown');

      // Stage 2 – 15 more seconds (20 s total): show retry UI
      h.returnFlowWatchdogTimer = setTimeout(() => {
        if (!mounted()) return;
        if (!store.isReturningFromWebView || h.webViewReturnError != null) {
          return;
        }
        if (h.loadWorkflowActive) {
          debugPrint('[HomePage] Return-flow watchdog: still loading, waiting...');
          return;
        }
        if (shouldOpenRedirectImmediately(store.fieldsWithAuth)) {
          debugPrint('[HomePage] Return-flow watchdog: redirect ready — opening WebView');
          void loadWorkflow();
          return;
        }
        debugPrint('[HomePage] Return-flow watchdog fired — showing retry UI');
        setState(() => {
          h.webViewReturnError =
            'Connection is taking too long. Please check your network and try again.';
          h.returnFlowMessage = 'Loading your next step...';
        });
      }, 15000);
    }, 5000);

    // Background poll every 5 seconds: auto-retry if no active call and still stuck
    h.returnFlowPollingTimer = setInterval(() => {
      if (!mounted()) {
        if (h.returnFlowPollingTimer != null) clearInterval(h.returnFlowPollingTimer);
        h.returnFlowPollingTimer = null;
        return;
      }
      if (!store.isReturningFromWebView) {
        if (h.returnFlowPollingTimer != null) clearInterval(h.returnFlowPollingTimer);
        h.returnFlowPollingTimer = null;
        return;
      }
      if (!h.loadWorkflowActive) {
        debugPrint('[HomePage] Return-flow polling: auto-retrying (no active call, still returning)');
        store.clearAuthError();
        if (h.webViewReturnError != null) {
          setState(() => {
            h.webViewReturnError = null;
            h.returnFlowMessage = 'Loading your next step...';
          });
        }
        void loadWorkflow();
      }
    }, 5000);
  }

  function stopReturnFlowTimers(): void {
    if (h.returnFlowWatchdogTimer != null) clearTimeout(h.returnFlowWatchdogTimer);
    h.returnFlowWatchdogTimer = null;
    if (h.returnFlowPollingTimer != null) clearInterval(h.returnFlowPollingTimer);
    h.returnFlowPollingTimer = null;
  }

  // ------------------------------------------------
  function leadQueryParam(keys: string[]): string {
    const qp = queryParams;
    for (const key of keys) {
      const direct = qp[key];
      if (direct != null && direct.trim().length > 0) return direct.trim();
      const lower = key.toLowerCase();
      for (const [k, v] of Object.entries(qp)) {
        if (k.toLowerCase() === lower && v.trim().length > 0) {
          return v.trim();
        }
      }
    }
    return '';
  }

  async function fetchKycLeadIdBeforeSso(opts: {mobileNumber: string}): Promise<string | null> {
    try {
      return await LeadSquaredAPI.captureLead({
        mobileNumber: opts.mobileNumber,
        firstName: leadQueryParam(['firstname', 'first_name', 'FirstName']),
        ageGroup: leadQueryParam(['age_group', 'mx_Lead_Age_Group']),
      });
    } catch (e) {
      debugPrint(`[HomePage] LeadSquared before SSO failed: ${e}`);
      return null;
    }
  }

  async function recoverInvalidSessionViaSso(s: AppStore): Promise<boolean> {
    if (!s.invalidUserSession) return false;
    debugPrint('[HomePage] Invalid session — clearing token and opening SSO');
    await StorageService.clearAuthTokens();
    s.clearAuthError();
    clearAuthenticatedStepCache();
    h.ssoAttempted = false;
    h.ssoInProgress = false;
    StorageService.setSsoAutoLoginEnabled(true);
    if (!mounted()) return false;
    return trySsoLoginIfNeeded(s);
  }

  async function fetchContextAndRecoverIfNeeded(s: AppStore, queryString: string): Promise<boolean> {
    await s.fetchWorkflowFieldsWithAuth(widget.company, widget.workflowName, queryString);
    if (!mounted()) return false;
    if (s.invalidUserSession) {
      const ssoOk = await recoverInvalidSessionViaSso(s);
      if (!ssoOk || !mounted()) return false;
      await s.fetchWorkflowFieldsWithAuth(widget.company, widget.workflowName, queryString);
      return mounted() && !s.invalidUserSession;
    }
    return isMap(s.fieldsWithAuth);
  }

  async function trySsoLoginIfNeeded(s: AppStore): Promise<boolean> {
    if (h.ssoAttempted || h.ssoInProgress) return h.ssoAttempted;

    if (await StorageService.hasAccessToken()) {
      debugPrint('[HomePage] SSO skipped — access token already present');
      h.ssoAttempted = true;
      return true;
    }

    if (mounted()) {
      setState(() => {
        h.ssoInProgress = true;
      });
    } else {
      h.ssoInProgress = true;
    }
    try {
      const creds = resolveSsoCredentials();
      const mobileNumber = creds.mobileNumber;
      const email = creds.email;

      debugPrint(`[HomePage] SSO credentials mobile=${mobileNumber} email=${email}`);

      debugPrint('[HomePage] No access token - attempting SSO login...');

      const leadFirstName = leadQueryParam(['firstname', 'first_name', 'FirstName']);
      const leadAgeGroup = leadQueryParam(['age_group', 'mx_Lead_Age_Group']);

      const kycLeadId = await fetchKycLeadIdBeforeSso({mobileNumber});
      if (kycLeadId != null && kycLeadId.length > 0) {
        debugPrint(`[HomePage] LeadSquared kyc_lead for SSO: ${kycLeadId}`);
      }

      const tokens = await SsoAPI.getSsoRouteTokens({
        company: widget.company,
        workflowName: widget.workflowName,
        mobileNumber,
        email,
        firstName: leadFirstName,
        ageGroup: leadAgeGroup,
        kycLeadId,
      });

      if (tokens == null) {
        debugPrint('[HomePage] SSO token fetch failed - fallback to OTP flow');
        return false;
      }

      await StorageService.setAccessToken(tokens.accessToken);
      await StorageService.setRefreshToken(tokens.refreshToken);
      await StorageService.setAuthSuccess('true');

      // Safety fallback in case backend still returns an OTP step.
      h.persistedMobileDigitsForOtp = mobileNumber;
      h.persistedEmailForOtp = email;

      s.clearAuthError();
      debugPrint('[HomePage] SSO tokens stored successfully');

      // Give backend a moment to persist session before first get-context (avoids intermittent 500).
      await delay(600);
      return true;
    } catch (e) {
      debugPrint(`[HomePage] SSO login exception: ${e}`);
      return false;
    } finally {
      if (mounted()) {
        setState(() => {
          h.ssoInProgress = false;
          h.ssoAttempted = true;
        });
      } else {
        h.ssoInProgress = false;
        h.ssoAttempted = true;
      }
    }
  }

  async function loadWorkflow(): Promise<void> {
    // Prevent concurrent calls — a second call while one is in flight is a no-op.
    if (h.loadWorkflowActive) {
      debugPrint('[HomePage] _loadWorkflow already running, skipping duplicate call');
      return;
    }
    if (!mounted()) return;
    setState(() => {
      h.loadWorkflowActive = true;
      h.digilockerUserDetailsFetchStarted = false;
    });

    debugPrint(`[HomePage] _loadWorkflow START: ${widget.company} / ${widget.workflowName}`);
    debugPrint(`[HomePage] _loadWorkflow queryParams: ${toStr(queryParams)}`);
    const s = store;
    // Tracks whether we navigated away inside this call so the finally block
    // knows not to prematurely clear isReturningFromWebView.
    let navigatingAway = false;

    // Start watchdog + polling timers only when in the WebView return flow.
    if (s.isReturningFromWebView) startReturnFlowTimers();

    try {
      s.setParams({company: widget.company, workflowName: widget.workflowName});
      let hasToken = await StorageService.hasAccessToken();
      debugPrint(`[HomePage] _loadWorkflow hasToken=${hasToken}`);

      // Auto-SSO only on fresh app journey when there is no saved token.
      const shouldTrySso =
        !h.ssoAttempted &&
        StorageService.ssoAutoLoginEnabled &&
        !s.isReturningFromWebView &&
        !hasToken;
      if (shouldTrySso) {
        debugPrint(`[HomePage] First-load: forcing SSO attempt (hasToken=${hasToken})`);
        // Do not set _submitLoading — SSO dialog is separate; avoids Processing under modal.
        const ssoOk = mounted() ? await trySsoLoginIfNeeded(s) : false;
        hasToken = hasToken || ssoOk;
      } else if (!h.ssoAttempted) {
        debugPrint(
          `[HomePage] Skipping auto-SSO (returnFromWebView=${s.isReturningFromWebView}, ssoAutoEnabled=${StorageService.ssoAutoLoginEnabled})`,
        );
        h.ssoAttempted = true;
      }

      if (hasToken) {
        // Build query string from redirect params (state, client_token, auto)
        const queryString = queryStringOf(queryParams);

        await fetchContextAndRecoverIfNeeded(s, queryString);

        // Extract workflowId from design_template (format: "company-workflowId-number")
        // Example: "mandotsecurities-2321998632-76" -> workflowId = "2321998632"
        let workflowId: string | null = null;
        const response = s.fieldsWithAuth;
        if (isMap(response)) {
          const ctx = isMap(response.context) ? response.context : null;
          const designTemplate = toStrOrNull(ctx?.design_template);
          if (designTemplate != null && designTemplate.includes('-')) {
            const parts = designTemplate.split('-');
            if (parts.length >= 2) {
              workflowId = parts[1]; // Second part is workflowId
              debugPrint(`[HomePage] Extracted workflowId from design_template: ${workflowId}`);
            }
          }

          // Also try extracting from user details if available
          if (workflowId == null || workflowId.length === 0) {
            // Will be fetched later if needed
          }
        }

        if (workflowId != null && workflowId.length > 0) {
          debugPrint(`[HomePage] Fetching stepper workflow: ${widget.workflowName} / ${workflowId}`);
          await s.fetchStepperWorkflow(widget.workflowName, workflowId);
        }

        // Check if KYC is completed (is_admin: true)
        if (responseIndicatesKycCompleted(response)) {
          navigatingAway = true;
          await navigateToKycCompletedIfNeeded(s);
          return;
        }

        // Check for redirect after get-context
        // Skip redirect if step completion params present (IPV, RPD, eSign, DigiLocker, etc.)
        // Prevents infinite loop when backend returns redirect despite completed step
        const isDigilockerVerifyReturn = queryParams.verify === 'digilocker';
        const hasCompletionParams =
          queryParams.success === 'yes' ||
          queryParams.verifyCompleted === 'true' ||
          queryParams.esign === 'yes' ||
          'transaction_id' in queryParams ||
          'reversepennydrop' in queryParams ||
          'reverse_pennydrop' in queryParams ||
          'account_aggregator' in queryParams;
        if (mounted() && isDigilockerVerifyReturn) {
          await handleDigilockerVerifyReturn(s);
        } else if (mounted() && !hasCompletionParams) {
          await checkAndHandleRedirect(s);
          // If _checkAndHandleRedirect navigated to WebView, mounted will be false
          if (!mounted()) navigatingAway = true;
        } else if (hasCompletionParams) {
          debugPrint('[HomePage] Step completed (success/transaction_id/esign) - handling redirect');

          // API often returns the next external URL (CAMS, DigiLocker, etc.) on the
          // completion-params call itself — open WebView immediately; do not wait for
          // a second get-context (slow/502) while the return-flow loader spins.
          if (mounted() && shouldOpenRedirectImmediately(s.fieldsWithAuth)) {
            debugPrint('[HomePage] External redirect on completion response — opening WebView now');
            stopReturnFlowTimers();
            await checkAndHandleRedirect(s);
            if (!mounted()) {
              navigatingAway = true;
              return;
            }
          }

          // Refresh context without completion params to update in-app state.
          await s.fetchWorkflowFieldsWithAuth(
            widget.company,
            widget.workflowName,
            '', // Call without completion params to get fresh state
          );

          // Some flows can trigger multiple get-context calls back-to-back (WebView close + route rebuild).
          // Avoid blocking progress just because `errorWithAuth` was set by an earlier call while the latest
          // `fieldsWithAuth` succeeded.
          let refreshed = s.fieldsWithAuth;
          if (mounted() && !isMap(refreshed)) {
            const err = toStr(s.errorWithAuth ?? '');
            const shouldRetryMultipleTabs = err.toLowerCase().includes('multiple tabs');

            if (shouldRetryMultipleTabs) {
              debugPrint('[HomePage] get-context failed due to multiple tabs - retrying once...');
              await delay(800);
              await s.fetchWorkflowFieldsWithAuth(
                widget.company,
                widget.workflowName,
                '', // Retry without completion params
              );
              refreshed = s.fieldsWithAuth;
            }

            if (mounted() && !isMap(refreshed)) {
              debugPrint(
                `[HomePage] Error refreshing context after step completion: ${s.errorWithAuth ?? 'fieldsWithAuth not a Map'}`,
              );
              if (shouldOpenRedirectImmediately(s.fieldsWithAuth)) {
                debugPrint('[HomePage] Refresh failed but redirect still available — opening WebView');
                stopReturnFlowTimers();
                await checkAndHandleRedirect(s);
                if (!mounted()) {
                  navigatingAway = true;
                  return;
                }
              } else if (s.isReturningFromWebView) {
                // Show retry UI — never fall back to the old step's form
                setState(() => {
                  h.webViewReturnError = friendlyApiErrorMessage(
                    s.errorWithAuth ?? 'Something went wrong, please try again.',
                  );
                });
              } else {
                Fluttertoast.showToast({msg: s.errorWithAuth ?? 'Error refreshing page', gravity: 'TOP'});
              }
              return;
            }
          }

          // Check if KYC is completed (is_admin: true)
          if (responseIndicatesKycCompleted(refreshed)) {
            navigatingAway = true;
            await navigateToKycCompletedIfNeeded(s);
            return;
          }

          // After refreshing context, check for redirects (backend may redirect to next step)
          if (mounted()) {
            await checkAndHandleRedirect(s);
            if (!mounted()) navigatingAway = true;
            // If no redirect, navigate to refresh the page with updated data
            if (mounted()) {
              const resp = s.fieldsWithAuth;
              if (!isMap(resp) || resp.redirect !== true) {
                debugPrint('[HomePage] Navigating to refresh page after step completion');
                navigatingAway = true;
                goTo(`/${widget.company}/${widget.workflowName}`);
              }
            }
          }
        }
      } else {
        await s.fetchWorkflowFields(widget.company, widget.workflowName);
      }
      debugPrint(`[HomePage] _loadWorkflow DONE, store.error=${s.error}`);
    } finally {
      // Cancel the one-shot watchdog (polling timer keeps running until the flag clears).
      if (h.returnFlowWatchdogTimer != null) clearTimeout(h.returnFlowWatchdogTimer);
      h.returnFlowWatchdogTimer = null;

      if (mounted()) {
        h.loadWorkflowActive = false;
        rerender();
      }

      // Clear isReturningFromWebView only when we stayed on this page (no route
      // change happened) and there is no pending retry error to display.
      if (mounted() && !navigatingAway && s.isReturningFromWebView && h.webViewReturnError == null) {
        s.setReturningFromWebView(false);
        stopReturnFlowTimers();
      }
    }
  }

  function isInternalWorkflowRedirectUrl(redirectUrl: string): boolean {
    const lower = redirectUrl.toLowerCase();
    const internalWorkflowPath = `/${widget.company.toLowerCase()}/${widget.workflowName.toLowerCase()}`;
    if (
      lower === internalWorkflowPath ||
      lower === `${internalWorkflowPath}/` ||
      lower.startsWith(`${internalWorkflowPath}?`)
    ) {
      return true;
    }
    const uri = uriTryParse(redirectUrl);
    if (uri == null) return false;
    const path = uri.path.toLowerCase();
    return (
      path === internalWorkflowPath ||
      path === `${internalWorkflowPath}/` ||
      path.startsWith(`${internalWorkflowPath}?`)
    );
  }

  /** True when get-context already has a non-internal redirect URL (open WebView now). */
  function shouldOpenRedirectImmediately(response: any): boolean {
    if (!isMap(response) || response.redirect !== true) return false;
    const redirectUrl = toStrOrNull(response.url) ?? '';
    if (redirectUrl.length === 0) return false;
    if (isInternalWorkflowRedirectUrl(redirectUrl)) return false;
    // RPD just succeeded — never reopen Bank Verification from the completion response.
    if (isRpdRedirectUrl(redirectUrl) && isRpdSuccessCompletionReturn()) {
      return false;
    }
    return (
      redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://') || redirectUrl.startsWith('/')
    );
  }

  function isRpdSuccessCompletionReturn(): boolean {
    if (store.rpdSuccessReturn) return true;
    const success = (queryParams.success ?? '').toLowerCase();
    if (success !== 'yes' && success !== 'true' && success !== '1') return false;
    return (
      'tr_id' in queryParams ||
      'transaction_id' in queryParams ||
      'reversepennydrop' in queryParams ||
      'reverse_pennydrop' in queryParams ||
      store.isReturningFromWebView
    );
  }

  function getContextQueryFromRedirectUrl(redirectUrl: string): string {
    let uri = uriTryParse(redirectUrl);
    if (uri == null || (uri.host.length === 0 && !redirectUrl.startsWith('/'))) {
      return '?verify=digilocker';
    }
    if (uri.host.length === 0) {
      const parsed = uriTryParse(
        `${EnvConfig.baseUrl}${redirectUrl.startsWith('/') ? redirectUrl : `/${redirectUrl}`}`,
      );
      if (parsed == null) throw new Error('FormatException: Invalid URI');
      uri = parsed;
    }
    return uri.query.length > 0 ? `?${uri.query}` : '?verify=digilocker';
  }

  function getContextResponseHasStepContext(response: any): boolean {
    return isMap(response) && isMap(response.context);
  }

  /**
   * After DigiLocker WebView: pass 1 = save (`verify=digilocker`), pass 2 = verify reload.
   * Must not call empty get-context (that brings back `render diverge` + breaks the form).
   */
  async function handleDigilockerVerifyReturn(s: AppStore): Promise<void> {
    debugPrint('[HomePage] DigiLocker verify return flow');
    let response = s.fieldsWithAuth;

    if (
      isMap(response) &&
      response.redirect === true &&
      (toStrOrNull(response.msg) ?? '') === 'redirect on verify is true'
    ) {
      const redirectUrl = toStrOrNull(response.url) ?? '';
      const queryString = getContextQueryFromRedirectUrl(redirectUrl);
      debugPrint(`[HomePage] DigiLocker verify pass 2 — get-context${queryString}`);
      await s.fetchWorkflowFieldsWithAuth(widget.company, widget.workflowName, queryString);
      response = s.fieldsWithAuth;
    }

    if (getContextResponseHasStepContext(response)) {
      const pos = (response as AnyMap).context?.position;
      debugPrint(`[HomePage] DigiLocker verify OK — step context position=${toStr(pos)}`);
      if (mounted()) {
        stopReturnFlowTimers();
        goTo(`/${widget.company}/${widget.workflowName}`);
        rerender();
      }
      return;
    }

    if (isMap(response) && response.redirect === true) {
      const url = toStrOrNull(response.url)?.toLowerCase() ?? '';
      if (url.includes('digilocker')) {
        debugPrint('[HomePage] DigiLocker still pending on backend — not opening WebView again');
        if (mounted()) rerender();
        return;
      }
    }

    if (mounted()) {
      await checkAndHandleRedirect(s);
    }
  }

  /** Builds the absolute URL for a backend redirect (`redirectUrl` may be relative). */
  function buildRedirectFinalUrl(redirectUrl: string): string {
    if (redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://')) {
      return redirectUrl;
    }
    // Relative URL - prepend baseUrl and preserve query params
    let relativeUrl = redirectUrl.startsWith('/') ? redirectUrl : `/${redirectUrl}`;

    // Append existing query params if not already present
    if (Object.keys(queryParams).length > 0 && !relativeUrl.includes('state')) {
      const separator = relativeUrl.includes('?') ? '&' : '?';
      const preservedParams = Object.entries(queryParams)
        .filter(([k]) => k !== 'verifyCompleted')
        .map(([k, v]) => `${k}=${encodeComponent(v)}`)
        .join('&');
      if (preservedParams.length > 0) {
        relativeUrl = `${relativeUrl}${separator}${preservedParams}`;
      }
    }

    return `${EnvConfig.baseUrl}${relativeUrl}`;
  }

  async function checkAndHandleRedirect(s: AppStore): Promise<void> {
    const response = s.fieldsWithAuth;
    if (isMap(response)) {
      const shouldRedirect = response.redirect === true;
      const redirectUrl = toStrOrNull(response.url);
      const msg = toStrOrNull(response.msg) ?? '';

      // Check if already processed
      const alreadyHasVerifyParam = 'verify' in queryParams || 'verifyCompleted' in queryParams;

      // User pressed back on Reverse Penny Drop — do not reopen RPD WebView.
      if (s.rpdReturn && shouldRedirect && redirectUrl != null && isRpdRedirectUrl(redirectUrl)) {
        debugPrint('[HomePage] Skipping RPD WebView redirect — rpd_return is true');
        return;
      }

      // Payment succeeded — backend sometimes still returns a fresh RPD URL.
      if (
        shouldRedirect &&
        redirectUrl != null &&
        isRpdRedirectUrl(redirectUrl) &&
        isRpdSuccessCompletionReturn()
      ) {
        debugPrint('[HomePage] Skipping RPD WebView after success — waiting for next step');
        return;
      }

      // DigiLocker just completed — get-context already ran with verify=digilocker + save.
      if (
        shouldRedirect &&
        queryParams.verify === 'digilocker' &&
        (redirectUrl?.toLowerCase().includes('digilocker') ?? false)
      ) {
        debugPrint('[HomePage] Skipping repeat DigiLocker WebView after verify=digilocker return');
        return;
      }

      if (shouldRedirect && redirectUrl != null && redirectUrl.length > 0) {
        // SPECIAL CASE: "redirect on verify is true" - call get-context API (no WebView)
        if (msg === 'redirect on verify is true') {
          const digilockerNeedsSecondVerifyPass = queryParams.verify === 'digilocker';
          if (alreadyHasVerifyParam && !digilockerNeedsSecondVerifyPass) {
            debugPrint('[HomePage] Skipping verify API redirect - already processed');
            return;
          }

          const queryString = getContextQueryFromRedirectUrl(redirectUrl);
          if (digilockerNeedsSecondVerifyPass || redirectUrl.toLowerCase().includes('verify=digilocker')) {
            debugPrint(`[HomePage] DigiLocker verify reload via get-context${queryString}`);
            await s.fetchWorkflowFieldsWithAuth(widget.company, widget.workflowName, queryString);
            if (getContextResponseHasStepContext(s.fieldsWithAuth) && mounted()) {
              goTo(`/${widget.company}/${widget.workflowName}`);
              rerender();
            }
            return;
          }

          // Extract query params from URL (e.g., verify=digilocker) — IPV / other verify flows
          const uri = uriTryParse(
            redirectUrl.startsWith('http')
              ? redirectUrl
              : `${EnvConfig.baseUrl}${redirectUrl.startsWith('/') ? redirectUrl : `/${redirectUrl}`}`,
          );
          if (uri == null) throw new Error('FormatException: Invalid URI');
          {
            const queryFromUri = uri.query;
            const lowerHost = uri.host.toLowerCase();
            const lowerPath = uri.path.toLowerCase();
            const isIpvOrFace =
              lowerHost.includes('ipv') ||
              lowerPath.includes('/ipv/') ||
              lowerPath.includes('face') ||
              lowerPath.includes('facefinder') ||
              lowerHost.includes('face');

            debugPrint('[HomePage] Special case: "redirect on verify is true" - calling get-context API');
            debugPrint(`[HomePage] Extracted query from URL: ${queryFromUri}`);

            // Call get-context API with verify param
            setState(() => {
              h.submitLoading = true;
            });
            await s.fetchWorkflowFieldsWithAuth(
              widget.company,
              widget.workflowName,
              queryFromUri.length === 0 ? '' : `?${queryFromUri}`,
            );
            setState(() => {
              h.submitLoading = false;
            });

            // Check for errors
            if (s.errorWithAuth != null) {
              debugPrint(`[HomePage] Error after verify get-context: ${s.errorWithAuth}`);
              Fluttertoast.showToast({msg: s.errorWithAuth ?? 'Error', gravity: 'TOP'});
            } else {
              debugPrint('[HomePage] Verify get-context completed successfully - data loaded in app');
            }

            // IPV/Face KYC case:
            // Backend provides a direct return URL (often with EMPTY query params).
            // In that scenario, we must open WebView automatically; otherwise user gets stuck on the non-IPV screen.
            if (isIpvOrFace && queryFromUri.length === 0 && mounted()) {
              const ensuredRedirectUrl = forceHttpsForRpd(redirectUrl);
              const friendlyTitle = deriveWebViewTitle(msg, ensuredRedirectUrl);
              debugPrint(`[HomePage] Auto-opening WebView for IPV/Face after verify reload: ${redirectUrl}`);
              await openWebViewWithTransitionLoader(ensuredRedirectUrl, friendlyTitle);
              return;
            }

            // If backend after verify-reload asks to redirect to some external page (often IPV),
            // handle it now. Otherwise user gets stuck until manual reload.
            const refreshed = s.fieldsWithAuth;
            if (
              isMap(refreshed) &&
              refreshed.redirect === true &&
              (toStrOrNull(refreshed.url)?.length ?? 0) > 0
            ) {
              const refreshedRedirectUrl = toStr(refreshed.url);
              const refreshedMsg = toStrOrNull(refreshed.msg) ?? msg;

              let refreshedFinalUrl = buildRedirectFinalUrl(refreshedRedirectUrl);

              refreshedFinalUrl = forceHttpsForRpd(refreshedFinalUrl);
              const friendlyTitle = deriveWebViewTitle(refreshedMsg, refreshedFinalUrl);
              debugPrint(`[HomePage] Opening WebView after verify reload (refreshed redirect): ${refreshedFinalUrl}`);
              await openWebViewWithTransitionLoader(refreshedFinalUrl, friendlyTitle);
              return;
            }

            return; // Don't open WebView for other verify modes (e.g. digilocker handled by backend via fields)
          }
        }

        // For all OTHER redirects - open WebView (like DigiLocker)
        // But if backend returns internal workflow path first (e.g. /bpwealth/individual),
        // do not open that URL in WebView. Refresh context once and open only external URL.
        if (isInternalWorkflowRedirectUrl(redirectUrl)) {
          debugPrint(
            `[HomePage] Internal workflow redirect received - refreshing context once instead of opening WebView: ${redirectUrl}`,
          );
          await s.fetchWorkflowFieldsWithAuth(widget.company, widget.workflowName, '');
          const refreshed = s.fieldsWithAuth;
          if (
            isMap(refreshed) &&
            refreshed.redirect === true &&
            (toStrOrNull(refreshed.url)?.length ?? 0) > 0
          ) {
            const nextRedirectUrl = toStr(refreshed.url);
            const refreshedMsg = toStrOrNull(refreshed.msg) ?? msg;
            if (isInternalWorkflowRedirectUrl(nextRedirectUrl)) {
              debugPrint('[HomePage] Refreshed redirect is still internal workflow URL - staying in app flow');
              return;
            }

            let refreshedFinalUrl = buildRedirectFinalUrl(nextRedirectUrl);

            refreshedFinalUrl = forceHttpsForRpd(refreshedFinalUrl);
            const friendlyTitle = deriveWebViewTitle(refreshedMsg, refreshedFinalUrl);
            debugPrint(`[HomePage] Opening WebView after internal-redirect refresh: ${refreshedFinalUrl}`);
            await openWebViewWithTransitionLoader(refreshedFinalUrl, friendlyTitle);
          }
          return;
        }

        let finalUrl = buildRedirectFinalUrl(redirectUrl);

        finalUrl = forceHttpsForRpd(finalUrl);
        const friendlyTitle = deriveWebViewTitle(msg, finalUrl);
        debugPrint(`[HomePage] Opening WebView for redirect (msg: ${msg}, title: ${friendlyTitle}): ${finalUrl}`);
        await openWebViewWithTransitionLoader(finalUrl, friendlyTitle);
      }
    }
  }

  /**
   * RPD/reverse_pennydrop sometimes returns `http://...` URLs.
   * Force `https://...` before opening the WebView.
   */
  function isRpdRedirectUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return (
      lower.includes('meon_reverse_pennydrop') ||
      lower.includes('reverse_pennydrop') ||
      lower.includes('reversepennydrop') ||
      lower.includes('rpd.meon')
    );
  }

  function forceHttpsForRpd(url: string): string {
    const uri = uriTryParse(url);
    if (uri == null) {
      const lower = url.toLowerCase();
      const isRpd = lower.includes('reverse_pennydrop') || lower.includes('reversepennydrop');
      if (isRpd && lower.startsWith('http://')) {
        return `https://${url.substring('http://'.length)}`;
      }
      return url;
    }

    const pathLower = uri.path.toLowerCase();
    const queryLower = uri.query.toLowerCase();
    const isRpd =
      pathLower.includes('reverse_pennydrop') ||
      pathLower.includes('reversepennydrop') ||
      queryLower.includes('reverse_pennydrop') ||
      queryLower.includes('reversepennydrop');

    if (isRpd && uri.scheme.toLowerCase() === 'http') {
      // Uri.replace(scheme: 'https')
      return `https${url.substring(url.indexOf(':'))}`;
    }

    return url;
  }

  /**
   * Prevents "previous step/login screen" flash between redirect API completion
   * and the actual WebView route rendering.
   */
  async function openWebViewWithTransitionLoader(finalUrl: string, friendlyTitle: string): Promise<void> {
    if (!mounted()) return;

    stopReturnFlowTimers();
    store.setReturningFromWebView(false);

    // Show a fully opaque white overlay so no home-page UI is visible during
    // the route transition.
    setState(() => {
      h.webViewTransitionActive = true;
      h.webViewReturnError = null;
    });
    // Ensure the white overlay is painted before navigating (WidgetsBinding.endOfFrame).
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

    const encodedUrl = encodeComponent(finalUrl);
    const title = encodeComponent(friendlyTitle);
    goTo(`/${widget.company}/${widget.workflowName}/webview?url=${encodedUrl}&title=${title}`);

    // If this widget remains mounted (rare edge-case), clear the overlay so a
    // back-navigation doesn't leave the screen blank.
    setTimeout(() => {
      if (!mounted()) return;
      setState(() => {
        h.webViewTransitionActive = false;
      });
    }, 600);
  }

  /**
   * Derives a user-friendly WebView title based on redirect message and URL.
   * Avoids showing internal messages like "redirect on render diverge" to the user.
   */
  function deriveWebViewTitle(msg: string, url: string): string {
    let module: string | null = null;
    const uri = uriTryParse(url);
    if (uri != null) {
      const host = uri.host.toLowerCase();
      const path = uri.path.toLowerCase();
      const query = uri.query.toLowerCase();

      if (path.includes('esign') || query.includes('esign')) {
        module = 'Proceed to eSign';
      } else if (host.includes('digilocker') || path.includes('digilocker') || query.includes('digilocker')) {
        module = 'Digilocker';
      } else if (
        path.includes('reverse_pennydrop') ||
        path.includes('reversepennydrop') ||
        query.includes('reverse_pennydrop')
      ) {
        module = 'Bank Verification';
      } else if (path.includes('account_aggregator') || query.includes('account_aggregator')) {
        module = 'Account Aggregator';
      } else if (host.includes('standardjourney.camsfinserv.com')) {
        module = 'Account Aggregator';
      } else if (host.includes('ipv') || path.includes('ipv') || path.includes('face')) {
        module = 'Face Verification';
      }
    }

    if (module != null) return module;

    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.length > 0 && !lowerMsg.startsWith('redirect on ')) {
      return msg;
    }

    return 'Verification';
  }

  function getStepperIndex(s: AppStore, isAuth: boolean): number {
    if (!isAuth) return 0;

    const currentIndex = s.getCurrentStepIndex();
    if (currentIndex != null) {
      debugPrint(`[HomePage] Stepper index from AppStore: ${currentIndex}`);
      return currentIndex;
    }

    const displayedSteps = getStepperSteps(s);
    const ctx = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth.context : undefined;
    let pageKey: string | null | undefined = s.currentPageId;
    if (pageKey == null || pageKey.length === 0) {
      if (isMap(ctx)) {
        const page = ctx.page;
        if (isMap(page)) {
          pageKey = toStrOrNull(page.id);
        }
        pageKey = pageKey ?? toStrOrNull(ctx.index);
      }
    }

    // Never map duplicate positions (e.g. mobile_otp) without page id — that hits step 2.
    if (pageKey != null && pageKey.length > 0) {
      const keyNum = intTryParse(pageKey);
      if (keyNum != null && keyNum >= 1 && displayedSteps.length > 0) {
        const idx = Math.min(Math.max(keyNum - 1, 0), displayedSteps.length - 1);
        debugPrint(`[HomePage] Stepper index from page key ${pageKey}: ${idx}`);
        return idx;
      }
      debugPrint(`[HomePage] Stepper index: page key ${pageKey} present but not mapped`);
      return 0;
    }

    return 0;
  }

  function getStepperSteps(s: AppStore): string[] {
    // Get dynamic steps from stepper workflow API
    const steps = s.getStepperSteps();
    if (steps.length > 0) {
      return steps;
    }
    // Fallback to default steps
    return KycStepperBar.defaultSteps;
  }

  /** True when the user is mid authenticated KYC (never fall back to unauth workflow UI). */
  function isMidAuthenticatedJourney(s: AppStore): boolean {
    return s.fieldsWithAuth != null || h.cachedAuthenticatedPageFields != null;
  }

  function cacheAuthenticatedStepUi(opts: {
    store: AppStore;
    ctx: AnyMap | null | undefined;
    pageTitle?: string | null;
    activePage?: any;
  }): void {
    const {ctx, pageTitle, activePage} = opts;
    if (!isMidAuthenticatedJourney(opts.store) && ctx == null) {
      return;
    }
    const position = toStrOrNull(ctx?.position);
    if (position != null && position.length > 0) {
      h.cachedPosition = position;
      if (!opts.store.loadingWithAuth && !h.submitLoading) {
        h.headerDisplayPosition = position;
      }
    }
    if (pageTitle != null && !pageTitle.toLowerCase().includes('start your kyc')) {
      h.cachedPageTitle = pageTitle;
    }
    if (isMap(activePage)) {
      h.cachedAuthenticatedPageFields = activePage;
    }
  }

  function clearAuthenticatedStepCache(): void {
    h.cachedAuthenticatedPageFields = null;
    h.cachedPageTitle = null;
    h.cachedPosition = null;
    h.headerDisplayPosition = null;
    h.fatcaTaxResidencyMustPickNo = false;
  }

  /** Position from get-context only when AppStore and context agree (fully settled). */
  function resolveSyncedPositionFromStore(s: AppStore): string | null {
    const ctx = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
    const fromCtx = toStrOrNull(ctx?.position)?.trim();
    if (fromCtx == null || fromCtx.length === 0) {
      return null;
    }
    const fromStore = s.currentPosition?.trim();
    if (fromStore != null && fromStore.length > 0 && fromStore.toLowerCase() !== fromCtx.toLowerCase()) {
      return null;
    }
    return fromCtx;
  }

  /** Pin current step in header before submit so the label does not vanish mid-save. */
  function captureHeaderPositionForSubmit(s: AppStore): void {
    const p =
      resolveSyncedPositionFromStore(s) ?? h.cachedPosition?.trim() ?? s.currentPosition?.trim();
    if (p != null && p.length > 0) {
      h.headerDisplayPosition = p;
    }
  }

  function beginSubmitTransition(s: AppStore): void {
    captureHeaderPositionForSubmit(s);
    const page = getActiveFields(s);
    if (isMap(page)) {
      h.submitFrozenPage = {...page};
    }
    h.submitFrozenFormSnapshot = {...formNotifier.formData};
    const ctx = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth.context : undefined;
    if (isMap(ctx)) {
      h.submitFrozenContext = {...ctx};
    }
  }

  function clearSubmitFreeze(): void {
    h.submitFrozenPage = null;
    h.submitFrozenFormSnapshot = null;
    h.submitFrozenContext = null;
  }

  function activeFieldsForUi(s: AppStore): any {
    if (h.submitLoading && h.submitFrozenPage != null) {
      return h.submitFrozenPage;
    }
    return getActiveFields(s);
  }

  function contextForUi(s: AppStore): AnyMap | null {
    if (h.submitLoading && h.submitFrozenContext != null) {
      return h.submitFrozenContext;
    }
    const c = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth.context : null;
    return isMap(c) ? c : null;
  }

  function displayFormValue(name: string): any {
    if (h.submitLoading && h.submitFrozenFormSnapshot != null) {
      if (name in h.submitFrozenFormSnapshot) {
        return h.submitFrozenFormSnapshot[name];
      }
    }
    return formNotifier.formData[name];
  }

  async function applyFreshStepAfterSuccessfulSubmit(s: AppStore): Promise<void> {
    const activeAfter = getActiveFields(s);
    const listAfter = (activeAfter?.fields as any[] | null | undefined) ?? [];
    const flowAfter = activeAfter?.conditionalFlow as any[] | null | undefined;
    formNotifier.updateFields(listAfter, flowAfter, {
      fieldsWithAuth: s.fieldsWithAuth,
      replaceFormData: true,
    });
    applyApiDefaultValues(listAfter);
    runPersonalDetailsBpWealthPipeline(s, listAfter);
    applyRpdReturnFieldIfNeeded(s, listAfter);
    const ctx = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
    syncDigilockerAadharImage(s, listAfter, {
      position: toStrOrNull(ctx?.position),
      pageLabel: toStrOrNull(ctx?.page?.data?.label),
    });
  }

  function finishSubmitTransition(opts: {store: AppStore; applyFreshStep: boolean}): void {
    if (opts.applyFreshStep) {
      void applyFreshStepAfterSuccessfulSubmit(opts.store);
    }
    clearSubmitFreeze();
    if (mounted()) {
      h.submitLoading = false;
      rerender();
    }
  }

  function getActiveFields(s: AppStore): any {
    if (responseIndicatesKycCompleted(s.fieldsWithAuth)) {
      return null;
    }
    const withAuth = s.fieldsWithAuth;
    if (withAuth != null && isMap(withAuth) && withAuth.context != null) {
      const page = withAuth.context.page;
      if (isMap(page)) {
        const fields = page.fields as any[] | null | undefined;
        if (fields != null && fields.length > 0) {
          h.cachedAuthenticatedPageFields = page;
          return page;
        }
        // Authenticated journey: keep auth page even if fields are momentarily empty.
        if (isMidAuthenticatedJourney(s)) {
          return page;
        }
      }
    }
    if (isMidAuthenticatedJourney(s) && h.cachedAuthenticatedPageFields != null) {
      return h.cachedAuthenticatedPageFields;
    }
    return s.fields;
  }

  function buildStepTransitionScaffold(opts: {
    showStepper: boolean;
    stepperWidget: React.ReactNode;
    message: string;
  }): React.ReactElement {
    return (
      <View style={{flex: 1, backgroundColor: KycTheme.background}}>
        <SafeAreaView style={{flex: 1}}>
          {opts.showStepper ? (
            <View style={{flex: 1}}>
              {opts.stepperWidget}
              <View style={{flex: 1}}>
                <Loader message={opts.message} minimal />
              </View>
            </View>
          ) : (
            <Loader message={opts.message} />
          )}
        </SafeAreaView>
      </View>
    );
  }

  /** Position + page label for form validation (same resolution as [_buildForm]). */
  function submitValidationStep(s: AppStore): {position: string | null; pageLabel: string | null} {
    const withAuth = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth : null;
    const c = isMap(withAuth?.context) ? withAuth!.context : null;
    let position: string | null = toStrOrNull(c?.position)?.toLowerCase() ?? null;
    let pageLabel: string | null = toStrOrNull(c?.page?.data?.label)?.toLowerCase() ?? null;
    if ((position ?? '').length === 0 || (pageLabel ?? '').length === 0) {
      const workflow = isMap(s.fields) ? s.fields : null;
      position = (toStrOrNull(workflow?.position) ?? '').toLowerCase();
      pageLabel = (toStrOrNull(workflow?.data?.label) ?? '').toLowerCase();
    }
    return {position, pageLabel};
  }

  /** `additional_nominee*`: toast only — submit button stays enabled. */
  function toastAndBlockIfAdditionalNomineeTotalNot100(s: AppStore): boolean {
    const step = submitValidationStep(s);
    if (!FV.isAdditionalNomineeKycStep(step.position, step.pageLabel)) {
      return false;
    }
    const activeFields = getActiveFields(s);
    const fieldList = (activeFields?.fields as any[] | null | undefined) ?? [];
    const msg = FV.validateAdditionalNomineeSubmitPercentageRequired100({
      fields: fieldList,
      formData: formNotifier.formData,
      runtimeFieldVisibility: formNotifier.fieldVisibility,
      company: widget.company,
      position: step.position,
      pageLabel: step.pageLabel,
    });
    if (msg == null) return false;
    Fluttertoast.showToast({
      msg,
      long: true,
      gravity: 'TOP',
      backgroundColor: '#F57C00', // Colors.orange.shade700
      textColor: '#FFFFFF',
    });
    return true;
  }


  async function maybeAutoSkipAdditionalNomineeForMaxThree(s: AppStore): Promise<boolean> {
    if (!FV.kNomineeMaxThreeOnly) return false;
    // Allow nested skip for additional_nominee → additional_nominee_second (max 2).
    if (h.autoSkipAdditionalNomineeDepth >= 2) return false;
    if (!mounted()) return false;

    const step = submitValidationStep(s);
    if (!FV.isAdditionalNomineeKycStep(step.position, step.pageLabel)) {
      return false;
    }

    const fieldList = (getActiveFields(s)?.fields as any[] | null | undefined) ?? [];
    const prior = FV.readPriorNomineeAllocatedPercent({
      formData: formNotifier.formData,
      fields: fieldList,
      position: step.position,
      pageLabel: step.pageLabel,
    });
    if (prior < 99.999) {
      debugPrint(`[HomePage] Max-3: additional_nominee prior=${prior} — not auto-skipping`);
      return false;
    }

    debugPrint(
      `[HomePage] Max-3: auto-skipping ${step.position}/${step.pageLabel} ` +
        `(prior=${prior} depth=${h.autoSkipAdditionalNomineeDepth})`,
    );
    formNotifier.formData[FV.kExtraSecondNomineeField] = 'No';
    if (findFieldDefByName(fieldList, FV.kRemainNomineePercentField) != null) {
      formNotifier.formData[FV.kRemainNomineePercentField] = '100';
    }
    if (findFieldDefByName(fieldList, FV.kRemainNomineePercent2Field) != null) {
      formNotifier.formData[FV.kRemainNomineePercent2Field] = '100';
    }
    if (findFieldDefByName(fieldList, FV.kTotalNomineePercentage2Field) != null) {
      formNotifier.formData[FV.kTotalNomineePercentage2Field] = '100';
    }

    h.autoSkipAdditionalNomineeDepth++;
    try {
      await handleCommonSubmit(true);
    } finally {
      h.autoSkipAdditionalNomineeDepth--;
    }
    return true;
  }

  function showValidationFailureToast(): void {
    const formToast = formNotifier.validationToastMessage;
    if (formToast != null && formToast.trim().length > 0) {
      Fluttertoast.showToast({
        msg: formToast,
        long: true,
        gravity: 'TOP',
        backgroundColor: RED_700,
        textColor: '#FFFFFF',
      });
      return;
    }
    const errors = formNotifier.errors;
    const errorValues = Object.values(errors);
    if (errorValues.length > 0) {
      const firstError = errorValues[0];
      if (firstError != null && toStr(firstError).length > 0) {
        Fluttertoast.showToast({
          msg: toStr(firstError),
          long: true,
          gravity: 'TOP',
          backgroundColor: RED_700,
          textColor: '#FFFFFF',
        });
        return;
      }
    }
    Fluttertoast.showToast({
      msg: 'Please fill all required fields correctly',
      long: true,
      gravity: 'TOP',
      backgroundColor: RED_700,
      textColor: '#FFFFFF',
    });
  }

  /** BP Wealth personal-details: UI grouping for standing-instruction fields (collapsed by default). */
  function bpWealthPersonalDetailsStandingUi(position: string | null | undefined, pageLabel: string | null | undefined): boolean {
    return isBpWealthCompany() && ((position ?? '') === 'personal_details' || (pageLabel ?? '') === 'personal_details');
  }

  function isOnboardingAuthStep(position: string | null | undefined, pageLabel: string | null | undefined): boolean {
    const p = (position ?? '').toLowerCase();
    const l = (pageLabel ?? '').toLowerCase();
    if (p === 'mobile' || l === 'mobile') return true;
    if (p === 'mobile_otp' || p.startsWith('mobile_otp')) return true;
    if (p === 'email_otp' || p.startsWith('email_otp')) return true;
    return isEmailCaptureStep(position, pageLabel);
  }

  function isEmailCaptureStep(position: string | null | undefined, pageLabel: string | null | undefined): boolean {
    const p = (position ?? '').toLowerCase();
    const l = (pageLabel ?? '').toLowerCase();
    if (p === 'email_otp' || p.startsWith('email_otp')) return false;
    if (p === 'email' || l === 'email' || p === 'emailid' || p === 'email_id') {
      return true;
    }
    return p.startsWith('email') && !p.startsWith('email_otp');
  }

  function isPersonalDetailsStep(position: string | null | undefined, pageLabel: string | null | undefined): boolean {
    return (position ?? '') === 'personal_details' || (pageLabel ?? '') === 'personal_details';
  }

  /** When user returns from RPD via back, backend expects `rpd_return: true` on personal_details submit. */
  function applyRpdReturnFieldIfNeeded(s: AppStore, fieldList: any[]): void {
    const ctx = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
    const position = toStrOrNull(ctx?.position)?.toLowerCase() ?? '';
    const pageLabel = toStrOrNull(ctx?.page?.data?.label)?.toLowerCase() ?? '';
    if (!isPersonalDetailsStep(position, pageLabel)) return;

    if (!s.rpdReturn) {
      const stale = formNotifier.formData.rpd_return;
      if (stale === true || (typeof stale === 'string' && stale.toLowerCase() === 'true')) {
        delete formNotifier.formData.rpd_return;
        h.activeFieldsSyncKey = null;
        debugPrint('[HomePage] personal_details: removed stale rpd_return form value');
      }
      return;
    }

    const existing = formNotifier.formData.rpd_return;
    if (existing === true || (typeof existing === 'string' && existing.toLowerCase() === 'true')) {
      return;
    }

    for (const f of fieldList) {
      if (!isMap(f)) continue;
      if (toStrOrNull(f.name) !== 'rpd_return') continue;
      const type = toStrOrNull(f.type) ?? 'hidden';
      formNotifier.handleChange('rpd_return', true, {
        type,
        validationType: toStrOrNull(f.validation),
      });
      debugPrint('[HomePage] personal_details: rpd_return form field set to true');
      return;
    }
  }

  function submissionIncludedRpdReturn(
    s: AppStore,
    submissionData: AnyMap,
    opts: {position: string | null; pageLabel: string | null},
  ): boolean {
    if (!isPersonalDetailsStep(opts.position, opts.pageLabel)) return false;
    if (s.rpdReturn) return true;
    const v = submissionData.rpd_return;
    return v === true || (v != null && toStr(v).toLowerCase() === 'true');
  }

  /** After personal_details submit with RPD return — stop passing `rpd_return` on later steps. */
  function clearRpdReturnState(s: AppStore): void {
    const hadGlobal = s.rpdReturn;
    const hadForm = Object.prototype.hasOwnProperty.call(formNotifier.formData, 'rpd_return');
    if (!hadGlobal && !hadForm) return;
    s.setRpdReturn(false);
    delete formNotifier.formData.rpd_return;
    h.activeFieldsSyncKey = null;
    debugPrint('[HomePage] rpd_return cleared after personal_details submit');
  }

  /** Personal details fields currently set to Yes for tax residency outside India. */
  function fatcaTaxResidencyYesFields(fieldList: any[]): AnyMap[] {
    const out: AnyMap[] = [];
    for (const raw of fieldList) {
      if (!isMap(raw)) continue;
      const f: AnyMap = {...raw};
      if (!CF.isTaxResidencyOutsideIndiaField(f)) continue;
      const name = toStrOrNull(f.name) ?? '';
      if (name.length === 0) continue;
      if (CF.isAffirmativeYesValue(formNotifier.formData[name])) {
        out.push(f);
      }
    }
    return out;
  }

  function resetFatcaTaxResidencyFieldsToNo(fields: AnyMap[]): void {
    for (const f of fields) {
      const name = toStrOrNull(f.name) ?? '';
      if (name.length === 0) continue;
      const values = f.values as any[] | null | undefined;
      const vNo = matchRadioOption(values, 'No');
      formNotifier.handleChange(name, vNo ?? 'No', {
        type: toStrOrNull(f.type) ?? 'select',
        validationType: toStrOrNull(f.validation),
        validateWith: toStrOrNull(f.validateWith),
      });
    }
  }

  /** After header refresh / get-context reload, unblock submit if form is not Yes. */
  function clearFatcaTaxResidencySubmitBlockIfFormAllows(fieldList: any[]): void {
    if (fatcaTaxResidencyYesFields(fieldList).length > 0) return;
    if (!h.fatcaTaxResidencyMustPickNo) return;
    if (mounted()) {
      setState(() => {
        h.fatcaTaxResidencyMustPickNo = false;
      });
    } else {
      h.fatcaTaxResidencyMustPickNo = false;
    }
  }

  async function refreshWorkflowFromHeader(s: AppStore): Promise<void> {
    s.clearAuthError();
    if (!mounted()) return;
    setState(() => {
      h.webViewReturnError = null;
      h.returnFlowMessage = 'Loading your next step...';
      h.fatcaTaxResidencyMustPickNo = false;
      h.refreshLoading = true;
    });
    try {
      await loadWorkflow();
      if (!mounted()) return;
      const active = getActiveFields(s);
      const list = (active?.fields as any[] | null | undefined) ?? [];
      const flow = active?.conditionalFlow as any[] | null | undefined;
      formNotifier.updateFields(list, flow, {fieldsWithAuth: s.fieldsWithAuth});
      runPersonalDetailsBpWealthPipeline(s, list);
      applyRpdReturnFieldIfNeeded(s, list);
      clearFatcaTaxResidencySubmitBlockIfFormAllows(list);
      if (mounted()) rerender();
    } finally {
      if (mounted()) setState(() => {
        h.refreshLoading = false;
      });
    }
  }

  /** Resets tax residency to No, shows modal + toast. Returns true if submit must stop. */
  function enforceFatcaTaxResidencyNoOnSubmit(opts: {
    position: string | null;
    pageLabel: string | null;
    fieldList: any[];
  }): boolean {
    if (!isPersonalDetailsStep(opts.position, opts.pageLabel)) return false;
    const yesFields = fatcaTaxResidencyYesFields(opts.fieldList);
    if (!h.fatcaTaxResidencyMustPickNo && yesFields.length === 0) return false;

    if (yesFields.length > 0) {
      resetFatcaTaxResidencyFieldsToNo(yesFields);
    }
    if (mounted()) {
      setState(() => {
        h.fatcaTaxResidencyMustPickNo = true;
      });
    } else {
      h.fatcaTaxResidencyMustPickNo = true;
    }
    if (mounted()) rerender();

    Fluttertoast.showToast({
      msg: 'Tax Residency outside India must be marked as No to continue.',
      long: true,
      gravity: 'TOP',
      backgroundColor: RED_700,
      textColor: '#FFFFFF',
    });
    // WidgetsBinding.instance.addPostFrameCallback
    setTimeout(() => {
      if (!mounted()) return;
      showFatcaTaxResidencyBlockedModal();
    }, 0);
    return true;
  }

  /** FATCA: eKYC cannot proceed when tax residency outside India is Yes. */
  function showFatcaTaxResidencyBlockedModal(): void {
    h.fatcaModalVisible = true;
    rerender();
  }

  function showDdpiSebiCircularModal(): void {
    h.ddpiModalVisible = true;
    rerender();
  }

  /** PAN capture (`detailspan`), PAN verify (`pan`), and KRA details (`kradetails`): **DD/MM/YYYY**. */
  function usesDdMmYyyyPanDateStep(position: string | null | undefined, pageLabel: string | null | undefined): boolean {
    if (CF.isKraDetailsStep(position, pageLabel)) return true;
    const p = (position ?? '').toLowerCase();
    const l = (pageLabel ?? '').toLowerCase();
    return p === 'pan' || l === 'pan' || p.startsWith('detailspan') || l.startsWith('detailspan');
  }

  /** Primary submit text: strip trailing arrows/chevrons from API `buttonName` (avoids double-arrow UI). */
  function primarySubmitLabel(opts: {isMobileStep: boolean; submitButton: AnyMap | null | undefined}): string {
    if (opts.isMobileStep) return 'Submit';
    let s = toStr(opts.submitButton?.buttonName ?? 'Submit').trim();
    if (s.length === 0) s = 'Submit';
    for (;;) {
      const t = s.replace(/[\s→➜➤▶›>]+$/, '');
      if (t === s || t.length === 0) break;
      s = t.trim();
    }
    return s.length === 0 ? 'Submit' : s;
  }

  function isNomineeSubmitDisabled(position: string | null | undefined, pageLabel: string | null | undefined): boolean {
    return FV.isNomineeSubmitCtaDisabled({
      formData: formNotifier.formData,
      position,
      pageLabel,
    });
  }

  function findFieldDefByName(fieldList: any[], name: string): AnyMap | null {
    for (const f of fieldList) {
      if (isMap(f) && toStrOrNull(f.name) === name) {
        return f;
      }
    }
    return null;
  }

  function setAddNomineeSelection(opts: {
    fieldList: any[];
    yes: boolean;
    position: string | null;
    pageLabel: string | null;
  }): void {
    const def = findFieldDefByName(opts.fieldList, FV.kAddNomineeField);
    if (def == null) return;
    const values = def.values as any[] | null | undefined;
    const pick = FV.resolveKycYesNoOptionValue(values, opts.yes ? 'Yes' : 'No');
    if (!opts.yes) {
      FV.clearMainNomineeBlockFormData({
        formData: formNotifier.formData,
        fields: opts.fieldList,
      });
    }
    formNotifier.handleChange(FV.kAddNomineeField, pick, {
      type: toStrOrNull(def.type) ?? 'select',
      validationType: toStrOrNull(def.validation),
      validateWith: toStrOrNull(def.validateWith),
    });
    if (mounted()) rerender();
  }

  function buildNomineeKycFormLayout(opts: {
    visibleFieldsForDisplay: any[];
    otpField: AnyMap | null;
    otpFieldName: string | null;
    hasAadharImage: boolean;
    activeFields: any;
    store: AppStore;
    fieldList: any[];
    position: string | null;
    pageLabel: string | null;
    ctx: AnyMap | null;
  }): React.ReactNode[] {
    const {fieldList, position, pageLabel} = opts;
    const addingNominee = FV.isAddNomineeSelectedYes(formNotifier.formData);
    const rows: React.ReactNode[] = [];

    // Always show Add Nominee Details Yes/No (API field) — was hidden by custom landing.
    const addNomineeField = findFieldDefByName(fieldList, FV.kAddNomineeField);
    if (addNomineeField != null) {
      rows.push(
        <React.Fragment key="nominee-add-nominee-field">
          {buildFormFieldRow({
            field: {...addNomineeField},
            otpField: opts.otpField,
            otpFieldName: opts.otpFieldName,
            hasAadharImage: opts.hasAadharImage,
            activeFields: opts.activeFields,
            store: opts.store,
            fieldList,
            position,
            pageLabel,
            ctx: opts.ctx,
          })}
        </React.Fragment>,
      );
    }

    if (addingNominee) {
      rows.push(<NomineeStepSection.maxNomineesHint key="nominee-max-hint" />);
      for (const raw of opts.visibleFieldsForDisplay) {
        if (!isMap(raw)) continue;
        const fieldMap: AnyMap = {...raw};
        const name = toStrOrNull(fieldMap.name) ?? '';
        if (!NomineeStepSection.isNomineeFormContentField(name)) continue;

        if (
          NomineeStepSection.shouldRenderStyledAddCheckbox({
            name,
            formData: formNotifier.formData,
          })
        ) {
          rows.push(
            <NomineeStepSection.optionalAddCheckboxButton
              key={`nominee-add-${name}`}
              onTap={() => {
                formNotifier.handleChange(name, true, {
                  type: toStrOrNull(fieldMap.type) ?? 'checkbox',
                  validationType: toStrOrNull(fieldMap.validation),
                  validateWith: toStrOrNull(fieldMap.validateWith),
                });
                if (mounted()) rerender();
              }}
            />,
          );
          continue;
        }

        if (FV.isNomineeStyledAddCheckboxField(name) && CF.isCheckboxCheckedValue(formNotifier.formData[name])) {
          continue;
        }

        rows.push(
          <React.Fragment key={`nominee-row-${name}`}>
            {buildFormFieldRow({
              field: fieldMap,
              otpField: opts.otpField,
              otpFieldName: opts.otpFieldName,
              hasAadharImage: opts.hasAadharImage,
              activeFields: opts.activeFields,
              store: opts.store,
              fieldList,
              position,
              pageLabel,
              ctx: opts.ctx,
            })}
          </React.Fragment>,
        );
      }
    }

    return rows;
  }

  /** One dynamic form row (shared by main list and Standing Instructions expansion). */
  function buildFormFieldRow(opts: {
    field: AnyMap;
    otpField: AnyMap | null;
    otpFieldName: string | null;
    hasAadharImage: boolean;
    activeFields: any;
    store: AppStore;
    fieldList: any[];
    position: string | null;
    pageLabel: string | null;
    ctx: AnyMap | null;
  }): React.ReactElement {
    const {field, otpField, otpFieldName, hasAadharImage, activeFields, fieldList, position, pageLabel, ctx} = opts;
    const name = toStrOrNull(field.name) ?? '';
    const type = toStrOrNull(field.type) ?? 'text';
    const lowerName = name.toLowerCase();
    const isAadharImageField = lowerName === 'aadhar_image' || lowerName === 'aadhaar_image';
    if (isAadharImageField && hasAadharImage) {
      return <View />;
    }
    if (otpField != null && name === otpFieldName) {
      return <View style={{paddingBottom: 20}}>{buildOtpVerifyCard(otpField, activeFields)}</View>;
    }

    if (
      FV.isAdditionalNomineeKycStep(position, pageLabel) &&
      NomineeStepSection.shouldRenderStyledAddCheckbox({
        name,
        formData: formNotifier.formData,
      })
    ) {
      return (
        <NomineeStepSection.optionalAddCheckboxButton
          onTap={() => {
            formNotifier.handleChange(name, true, {
              type,
              validationType: toStrOrNull(field.validation),
              validateWith: toStrOrNull(field.validateWith),
            });
            if (mounted()) rerender();
          }}
        />
      );
    }

    if (
      FV.isAdditionalNomineeKycStep(position, pageLabel) &&
      FV.isNomineeStyledAddCheckboxField(name) &&
      CF.isCheckboxCheckedValue(formNotifier.formData[name])
    ) {
      return <View />;
    }

    const label = toStrOrNull(ctx?.page?.data?.label)?.toLowerCase() ?? null;
    const isBankScreen = position === 'bank' || position === 'bank_details' || label === 'bank';
    const isIfscField = isBankScreen && (name === 'ifsc' || name.toLowerCase().includes('ifsc'));

    const editableFields = formNotifier.editableFieldsList;
    const disableFromConditionalFlow = editableFields.some(e => isMap(e) && e.name === name);
    const disableOnFetchedDataReview = CF.fetchedDataReviewFieldReadOnly(position, pageLabel, field);
    const isKraContinueChoice = CF.isKraDetailsStep(position, pageLabel) && CF.kraDetailsContinueWithKraChoiceField(field);
    const disable = !isKraContinueChoice && (disableFromConditionalFlow || disableOnFetchedDataReview);

    const isEmailStep = position === 'email' || position === 'emailid' || position === 'email_id' || label === 'email';
    const isEmailField =
      (name.toLowerCase() === 'email' ||
        name.toLowerCase() === 'email_id' ||
        name.toLowerCase() === 'emailid' ||
        name.toLowerCase().includes('email')) &&
      type === 'text';

    return (
      <View style={{paddingBottom: 20, alignItems: 'stretch'}}>
        <FormFieldWidget
          key={name}
          name={name}
          displayName={field.displayName ?? name}
          type={type}
          fileType={field.fileType as any[] | null | undefined}
          size={field.size}
          mandatory={field.mandatory === true}
          validation={field.validation}
          popupAfterSubmit={activeFields?.popupAfterSubmit as any[] | null | undefined}
          value={coalesceFormFieldValue(
            displayFormValue(name),
            CF.resolveApiFieldSeedValue(field),
            {type},
          )}
          onGoogleSignIn={handleGoogleSignIn}
          googleSignInLoading={h.googleSignInLoading}
          onChange={(n: string, v: any) => {
            const f = fieldList.find(x => isMap(x) && x.name === n) ?? null;
            const previousValue = formNotifier.formData[n];
            const changedField: AnyMap = f ?? field;
            const isTaxResidencyYesOnPersonalDetails =
              isPersonalDetailsStep(position, pageLabel) &&
              CF.isTaxResidencyOutsideIndiaField(changedField) &&
              CF.isAffirmativeYesValue(v);
            if (
              isPersonalDetailsStep(position, pageLabel) &&
              CF.isTaxResidencyOutsideIndiaField(changedField) &&
              !CF.isAffirmativeYesValue(v)
            ) {
              if (h.fatcaTaxResidencyMustPickNo && mounted()) {
                setState(() => {
                  h.fatcaTaxResidencyMustPickNo = false;
                });
              }
            }
            if (isTaxResidencyYesOnPersonalDetails) {
              const values = changedField.values as any[] | null | undefined;
              const vNo = matchRadioOption(values, 'No');
              if (mounted()) {
                setState(() => {
                  h.fatcaTaxResidencyMustPickNo = true;
                });
              } else {
                h.fatcaTaxResidencyMustPickNo = true;
              }
              formNotifier.handleChange(n, vNo ?? 'No', {
                type: toStrOrNull(f?.type) ?? toStrOrNull(changedField.type) ?? 'select',
                validationType: toStrOrNull(f?.validation),
                validateWith: toStrOrNull(f?.validateWith),
              });
              if (mounted()) rerender();
              setTimeout(() => {
                if (!mounted()) return;
                showFatcaTaxResidencyBlockedModal();
              }, 0);
              return;
            }

            const isDdpiYesOnPersonalDetails =
              isPersonalDetailsStep(position, pageLabel) &&
              CF.isDdpiFormField(changedField) &&
              CF.isDdpiAffirmativeValue(v) &&
              !CF.isDdpiAffirmativeValue(previousValue);
            formNotifier.handleChange(n, v, {
              type: toStrOrNull(f?.type) ?? 'text',
              validationType: toStrOrNull(f?.validation),
              validateWith: toStrOrNull(f?.validateWith),
            });
            if (n === 'sebi_3years' || n === 'sebi_3year') {
              const pastVal = formNotifier.formData.past_action;
              if (typeof pastVal === 'boolean') {
                formNotifier.handleChange('past_action', '', {type: 'text'});
              }
            }
            if (isDdpiYesOnPersonalDetails) {
              setTimeout(() => {
                if (!mounted()) return;
                showDdpiSebiCircularModal();
              }, 0);
            }
            if (pageLabel === 'mobile' && (n === 'mobile' || n === 'phone' || n === 'mobile_number')) {
              setState(() => {
                h.showMobileError = false;
              });
            }
          }}
          onBlur={(n: string) => {
            formNotifier.handleBlur(n, {position, pageLabel});
            if (isIfscField) {
              const ifscValue = toStr(formNotifier.formData[n] ?? '');
              if (ifscValue.length === 11) {
                void fetchBankDetailsByIfsc(ifscValue);
              }
            }
          }}
          values={field.values as any[] | null | undefined}
          visible
          errorField={formNotifier.errors[name]}
          rows={typeof field.rows === 'number' && Number.isInteger(field.rows) ? field.rows : intTryParse(toStr(field.rows ?? ''))}
          cols={typeof field.cols === 'number' && Number.isInteger(field.cols) ? field.cols : intTryParse(toStr(field.cols ?? ''))}
          urlCompany={widget.company}
          workflowKey={opts.store.resolveWorkflowKey()}
          disable={disable}
          apiFieldMeta={field}
          useDdMmYyyyDateDisplay={usesDdMmYyyyPanDateStep(position, pageLabel)}
        />
        {isEmailStep && isEmailField ? (
          <>
            <View style={{height: 12}} />
            <OutlinedButton
              fullWidth
              paddingVertical={12}
              paddingHorizontal={16}
              onPress={h.googleSignInLoading ? null : handleGoogleSignIn}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                <MaterialIcon name="g_mobiledata" size={20} color={h.googleSignInLoading ? 'rgba(29,27,32,0.38)' : KycTheme.primary} />
                <View style={{width: 8}} />
                <Text style={{fontSize: 14, fontWeight: '500', color: h.googleSignInLoading ? 'rgba(29,27,32,0.38)' : KycTheme.primary}}>
                  {h.googleSignInLoading ? 'Signing in...' : 'Sign in with Google'}
                </Text>
              </View>
            </OutlinedButton>
          </>
        ) : null}
        {isIfscField ? (
          <>
            <View style={{height: 12}} />
            <OutlinedButton
              fullWidth
              paddingVertical={12}
              paddingHorizontal={16}
              onPress={() => {
                const ifscValue = toStr(formNotifier.formData[name] ?? '');
                if (ifscValue.length === 11) {
                  void fetchBankDetailsByIfsc(ifscValue);
                } else {
                  Fluttertoast.showToast({msg: 'Please enter valid 11-digit IFSC code', gravity: 'TOP'});
                }
              }}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                <MaterialIcon name="search" size={20} color={KycTheme.primary} />
                <View style={{width: 8}} />
                <Text style={{fontSize: 14, fontWeight: '500', color: KycTheme.primary}}>Fetch Bank Details</Text>
              </View>
            </OutlinedButton>
          </>
        ) : null}
        {pageLabel === 'mobile' &&
        (name === 'mobile' || name === 'phone' || name === 'mobile_number') &&
        h.showMobileError ? (
          <>
            <View style={{height: 8}} />
            <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
              <MaterialIcon name="error_outline" size={16} color={RED_700} />
              <View style={{width: 4}} />
              <View style={{flex: 1}}>
                <Text style={{fontSize: 12, color: RED_700}}>Please enter a valid 10-digit mobile number</Text>
              </View>
            </View>
          </>
        ) : null}
      </View>
    );
  }

  async function prepareFormData(skipValidation: boolean): Promise<AnyMap> {
    const data: AnyMap = {...formNotifier.formData};
    // Do not send `save` in kyc-post-v2 body (backend expectation).

    const s = store;
    const activeFields = getActiveFields(s);
    const fieldList = activeFields?.fields as any[] | null | undefined;
    const ctx = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth.context : null;
    const nomineePos = toStrOrNull(ctx?.position);
    const nomineeLbl = toStrOrNull(ctx?.page?.data?.label);
    FV.applyNomineeStepSubmitPayload({
      data,
      fields: fieldList,
      runtimeFieldVisibility: formNotifier.fieldVisibility,
      company: widget.company,
      position: nomineePos,
      pageLabel: nomineeLbl,
    });

    // Add brokerage_plan for segments screen
    let panPos = toStrOrNull(ctx?.position)?.toLowerCase() ?? '';
    let panLbl = toStrOrNull(ctx?.page?.data?.label)?.toLowerCase() ?? '';
    if (panPos.length === 0 || panLbl.length === 0) {
      const workflow = isMap(s.fields) ? s.fields : null;
      panPos = (toStrOrNull(workflow?.position) ?? panPos).toLowerCase();
      panLbl = (toStrOrNull(workflow?.data?.label) ?? panLbl).toLowerCase();
    }
    const pathSegment = getKycPostPathSegment(ctx);
    if (KD.isPanVerifyKycPostStep(panPos, pathSegment)) {
      const normalized = KD.buildPanVerifyKycPostBody(data);
      for (const k of Object.keys(data)) delete data[k];
      Object.assign(data, normalized);
      syncPanVerifyFieldsToForm(normalized);
    } else if (usesDdMmYyyyPanDateStep(panPos, panLbl)) {
      const apiPanDob = KD.tryFormatKycPanDobForMatchApi(data.pan_dob_for_match);
      if (apiPanDob != null) data.pan_dob_for_match = apiPanDob;
      const rawName = data.name != null ? toStr(data.name) : null;
      if (rawName != null && rawName.trim().length > 0) {
        data.name = rawName.trim().toUpperCase();
      }
      const rawPan = data.pan_number != null ? toStr(data.pan_number) : null;
      if (rawPan != null && rawPan.trim().length > 0) {
        data.pan_number = rawPan.trim().toUpperCase();
      }
    }
    const position = toStrOrNull(ctx?.position)?.toLowerCase() ?? null;
    if (position === 'segments') {
      // UI no longer exposes MTF / currency; keep payload aligned with backend.
      // `brokerage_plan` is only sent when the user confirms via the dialog (non-empty in form).
      data.mtf = false;
      data.nse_currency = false;
      data.bse_currency = false;
      // Mandatory segments (live parity): always submitted as true.
      data.nse_cash = true;
      data.bse_cash = true;
      data.mf = true;
      // NSE SLBM is not selectable — always submit as false.
      data.nse_slbm = false;
    }

    // Only send fields for the active step — not entire accumulated formData.
    if (fieldList != null && position !== 'segments') {
      const filtered = FV.isNomineeExtendedUiStep(nomineePos, nomineeLbl)
        ? FV.buildNomineeKycPostV2Body({data, fields: fieldList})
        : CF.filterKycPostV2BodyForStep({
            data,
            fields: fieldList,
            runtimeFieldVisibility: formNotifier.fieldVisibility,
            company: widget.company,
            position: nomineePos,
            pageLabel: nomineeLbl,
          });
      for (const k of Object.keys(data)) delete data[k];
      Object.assign(data, filtered);
      FV.syncExtraNomineeSubmitPayload({
        data,
        fields: fieldList,
        runtimeFieldVisibility: formNotifier.fieldVisibility,
        company: widget.company,
        position: nomineePos,
        pageLabel: nomineeLbl,
      });
      // After filter: re-inject step % total (filter drops hidden computed fields).
      FV.syncNomineeStepPercentTotalsSubmitPayload({
        data,
        fields: fieldList,
        position: nomineePos,
        pageLabel: nomineeLbl,
      });
    }

    // Step filter drops companion keys like `{fileField}_pass` (not in API field list).
    // Web sends them with the upload — re-inject from formData for every File on this step.
    for (const [key, value] of Object.entries({...data})) {
      if (!isPickedFile(value)) continue;
      const passKey = `${key}_pass`;
      const passVal = formNotifier.formData[passKey];
      if (passVal == null) continue;
      const passStr = toStr(passVal);
      if (passStr.length === 0) continue;
      data[passKey] = passStr;
      debugPrint(`[HomePage] Re-injected PDF password field: ${passKey} (len=${passStr.length})`);
    }

    if (s.rpdReturn && isPersonalDetailsStep(nomineePos, nomineeLbl)) {
      data.rpd_return = true;
    }

    // Dart built an unused http.MultipartRequest here for file steps and returned [data]
    // (caller uses multipart separately); nothing observable, so it is not replicated.
    return data;
  }

  async function handleSubmit(skipValidation: boolean): Promise<void> {
    h.submitError = '';
    h.submitSuccess = '';
    const s = store;
    // RN-only: a focused DD/MM/YYYY text input must be committed before reading form data.
    commitPendingDateInputs();

    // Enforce Terms & Conditions on mobile login step
    if (!skipValidation) {
      const withAuth = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth : null;
      const ctx = isMap(withAuth?.context) ? withAuth!.context : null;

      let position = toStrOrNull(ctx?.position)?.toLowerCase() ?? '';
      let label = toStrOrNull(ctx?.page?.data?.label)?.toLowerCase() ?? '';

      if (position.length === 0 || label.length === 0) {
        const workflow = isMap(s.fields) ? s.fields : null;
        position = (toStrOrNull(workflow?.position) ?? position).toLowerCase();
        label = (toStrOrNull(workflow?.data?.label) ?? label).toLowerCase();
      }

      debugPrint(`[HomePage] _handleSubmit position=${position} label=${label}`);

      const isMobileScreen = position === 'mobile' && label === 'mobile';
      if (isMobileScreen) {
        if (!h.termsAccepted) {
          setState(() => {
            h.showTermsError = true;
            h.showMobileError = false;
          });
          Fluttertoast.showToast({
            msg: 'Please accept the Terms & Conditions to continue',
            long: true,
            gravity: 'TOP',
            backgroundColor: RED_700,
            textColor: '#FFFFFF',
          });
          return;
        }
        const mobile = formNotifier.formData.mobile ?? formNotifier.formData.phone ?? formNotifier.formData.mobile_number ?? '';
        const digits = toStr(mobile).replace(/\D/g, '');
        if (digits.length !== 10 || !/^[6-9]/.test(digits)) {
          setState(() => {
            h.showMobileError = true;
            h.showTermsError = false;
          });
          Fluttertoast.showToast({
            msg: 'Please enter a valid 10-digit mobile number',
            long: true,
            gravity: 'TOP',
            backgroundColor: RED_700,
            textColor: '#FFFFFF',
          });
          return;
        }
      }
    }

    if (!skipValidation) {
      const step = submitValidationStep(s);
      const isValid = formNotifier.validate({
        company: widget.company,
        position: step.position,
        pageLabel: step.pageLabel,
      });
      if (!isValid) {
        debugPrint('[HomePage] Send OTP / Submit: validation failed');
        debugPrint(`[HomePage] Validation errors: ${JSON.stringify(formNotifier.errors)}`);
        showValidationFailureToast();
        return;
      }
      if (toastAndBlockIfAdditionalNomineeTotalNot100(s)) return;
    }
    Keyboard.dismiss();
    debugPrint('[HomePage] Send OTP / Submit START');
    setState(() => {
      beginSubmitTransition(s);
      h.submitLoading = true;
    });

    try {
      const data = await prepareFormData(skipValidation);
      debugPrint(`[HomePage] Form data (Send OTP): ${JSON.stringify(data)}`);
      const activeFields = getActiveFields(s);
      const fieldList = (activeFields?.fields as any[] | null | undefined) ?? [];
      const hasFile = fieldList.some(f => isMap(f) && f.type === 'file') || Object.values(data).some(v => isPickedFile(v));

      // Check saveFilesAPI flag from context.page (check both fieldsWithAuth and fields)
      const withAuth = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth : null;
      const workflow = isMap(s.fields) ? s.fields : null;
      const ctx = (withAuth?.context ?? workflow?.context) as AnyMap | null | undefined;
      const page = isMap(ctx?.page) ? ctx!.page : null;
      const saveFilesAPI = page?.saveFilesAPI === true;
      debugPrint(`[HomePage] _handleSubmit saveFilesAPI flag: ${saveFilesAPI}`);

      const endpoint = `/api/get-user/${widget.company}/${widget.workflowName}`;
      const fullUrl = `${EnvConfig.baseUrl}${endpoint}`;
      debugPrint(`[HomePage] _handleSubmit hasFile=${hasFile}`);
      debugPrint(`[HomePage] _handleSubmit FULL URL: ${fullUrl}`);
      debugPrint(`[HomePage] _handleSubmit ENDPOINT: ${endpoint}`);

      // If saveFilesAPI is true, upload files separately first
      if (hasFile && saveFilesAPI) {
        debugPrint('[HomePage] _handleSubmit saveFilesAPI=true: Uploading files separately to /api/upload_files_new');
        const filesToUpload: Array<[string, PickedFile]> = [];

        // Extract files from data
        for (const [k, v] of Object.entries(data)) {
          if (isPickedFile(v)) {
            filesToUpload.push([k, v]);
          }
        }

        // Upload each file separately to /api/upload_files_new
        for (const [fileKey, file] of filesToUpload) {
          // e.g., signature_upload, pan_upload, etc.
          try {
            debugPrint(`[HomePage] _handleSubmit Uploading file: ${fileKey} = ${file.path}`);
            const uploadRes = await ApiClient.postMultipart(
              async () => ({
                method: 'POST' as const,
                url: `${EnvConfig.baseUrl}/api/upload_files_new`,
                fields: {},
                files: [{field: fileKey, path: file.path, filename: file.name, contentType: file.mimeType}],
                headers: {accept: '*/*'},
              }),
              {skipRefreshOn401: true},
            );
            debugPrint(`[HomePage] _handleSubmit File upload response for ${fileKey}: ${uploadRes.statusCode}`);

            if (uploadRes.statusCode < 200 || uploadRes.statusCode >= 300) {
              debugPrint(`[HomePage] _handleSubmit File upload failed for ${fileKey}: ${uploadRes.body}`);
              Fluttertoast.showToast({
                msg: `Failed to upload ${fileKey}`,
                gravity: 'TOP',
              });
              if (mounted()) {
                clearSubmitFreeze();
                setState(() => {
                  h.submitLoading = false;
                });
              }
              return;
            }
          } catch (e) {
            debugPrint(`[HomePage] _handleSubmit Error uploading file ${fileKey}: ${e}`);
            Fluttertoast.showToast({
              msg: `Error uploading file: ${e}`,
              gravity: 'TOP',
            });
            if (mounted()) {
              clearSubmitFreeze();
              setState(() => {
                h.submitLoading = false;
              });
            }
            return;
          }
        }

        // Remove files from data after successful upload
        for (const [key] of filesToUpload) {
          delete data[key];
        }
        debugPrint('[HomePage] _handleSubmit Files uploaded successfully, continuing with form submission');
      }

      if (hasFile && !saveFilesAPI) {
        // Use multipart/form-data for file uploads (existing flow when saveFilesAPI=false)
        const res = await ApiClient.postMultipart(async () => {
          const fields: Record<string, string> = {};
          const files: Array<{field: string; path: string; filename?: string; contentType?: string}> = [];
          for (const [k, v] of Object.entries(data)) {
            if (isPickedFile(v)) {
              files.push({field: k, path: v.path, filename: v.name, contentType: v.mimeType});
            } else if (typeof v === 'boolean') {
              fields[k] = String(v);
            } else if (v != null) {
              fields[k] = toStr(v);
            }
          }
          return {method: 'POST' as const, url: fullUrl, fields, files, headers: {}};
        });
        await handleSubmitResponse(res, s);
      } else {
        // Use JSON for non-file submissions (or after files uploaded separately)
        const headers = {'Content-Type': 'application/json'};
        const res = await KycAPI.submitKyc(widget.company, widget.workflowName, data, headers);
        await handleSubmitResponse(res, s);
      }
    } catch (e: any) {
      debugPrint(`[HomePage] Send OTP / Submit Exception: ${e}\n${e?.stack ?? ''}`);
      Fluttertoast.showToast({msg: toStr(e), gravity: 'TOP'});
    } finally {
      if (mounted() && h.submitFrozenPage != null) {
        clearSubmitFreeze();
        setState(() => {
          h.submitLoading = false;
        });
      }
      debugPrint('[HomePage] Send OTP / Submit DONE');
    }
  }


  /** `jsonDecode(body) as Map<String, dynamic>?` — anything that is not an object (or null) throws in Dart. */
  function decodeJsonMapOrNull(text: string): AnyMap | null {
    const v = JSON.parse(text);
    if (v === null) return null;
    if (isMap(v)) return v;
    throw new Error('not a map');
  }

  async function handleSubmitResponse(res: HttpResponse, s: AppStore): Promise<void> {
    debugPrint(
      `[HomePage] _handleSubmitResponse status=${res.statusCode} body=${res.body.length > 300 ? res.body.substring(0, 300) + '...' : res.body}`,
    );
    let body: AnyMap | null;
    try {
      body = decodeJsonMapOrNull(res.body);
    } catch (_) {
      body = null;
    }
    try {
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.success === true) {
        const ctxBeforeRefresh = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
        const submitPosition = toStrOrNull(ctxBeforeRefresh?.position)?.toLowerCase() ?? '';
        const submitLabel = toStrOrNull(ctxBeforeRefresh?.page?.data?.label)?.toLowerCase() ?? '';
        const submittedPersonalDetailsWithRpdReturn = s.rpdReturn && isPersonalDetailsStep(submitPosition, submitLabel);

        const token = typeof body?.access_token === 'string' ? (body.access_token as string) : null;
        const refresh = typeof body?.refresh_token === 'string' ? (body.refresh_token as string) : null;
        if (token != null) await StorageService.setAccessToken(token);
        if (refresh != null) await StorageService.setRefreshToken(refresh);
        await StorageService.setAuthSuccess('true');
        await StorageService.setMessage(toStrOrNull(body?.msg) ?? '');
        await StorageService.setUserStep(toStrOrNull(body?.position) ?? '');
        const formSnapshot: AnyMap = {...formNotifier.formData};
        const digitsBeforeReset = digitsFromFormMapOnly(formSnapshot);
        if (digitsBeforeReset.length === 10) {
          h.persistedMobileDigitsForOtp = digitsBeforeReset;
        }
        const emailBeforeReset = resolveEmailForOtpUi(formSnapshot);
        if (emailBeforeReset.includes('@')) {
          h.persistedEmailForOtp = emailBeforeReset;
        }
        if (submittedPersonalDetailsWithRpdReturn) {
          clearRpdReturnState(s);
        }
        // Keep filled values visible until get-context returns; then clear and apply new step.
        await s.fetchWorkflowFieldsWithAuth(widget.company, widget.workflowName, '');
        if (mounted() && s.errorWithAuth != null) {
          if (s.hasPdfDocumentEncryptedContextError) {
            recoverFromPdfDocumentEncryptedError(s);
            finishSubmitTransition({store: s, applyFreshStep: false});
            return;
          }
          if (s.hasInvalidPanContextError) {
            recoverFromInvalidPanContextError(s);
            return;
          }
          if (isHtmlOrInfraErrorBody(s.errorWithAuth)) {
            debugPrint('[HomePage] get-context failed with server/HTML response — keeping session (not clearing storage)');
            Fluttertoast.showToast({
              msg: 'Could not refresh your progress. Please try again.',
              gravity: 'TOP',
            });
            finishSubmitTransition({store: s, applyFreshStep: false});
            return;
          }
          await clearCookiesAndRefresh();
          Fluttertoast.showToast({msg: s.errorWithAuth ?? 'Session updated. Please continue.', gravity: 'TOP'});
          finishSubmitTransition({store: s, applyFreshStep: false});
          return;
        }
        if (mounted()) {
          const authResponse = s.fieldsWithAuth;
          if (responseIndicatesKycCompleted(authResponse)) {
            clearSubmitFreeze();
            setState(() => {
              h.submitLoading = false;
            });
            await navigateToKycCompletedIfNeeded(s);
            return;
          }
        }
        if (mounted()) {
          await delay(300);
          await applyFreshStepAfterSuccessfulSubmit(s);
          const ctx = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth : null;
          const pos = toStrOrNull(ctx?.context?.position)?.toLowerCase() ?? '';
          if (pos === 'mobile_otp') {
            applyPersistedMobileToForm();
            h.persistedEmailForOtp = null;
          } else if (pos === 'email_otp') {
            h.persistedMobileDigitsForOtp = null;
            applyPersistedEmailToForm();
          } else {
            h.persistedMobileDigitsForOtp = null;
            h.persistedEmailForOtp = null;
          }
          clearSubmitFreeze();
          setState(() => {
            h.submitLoading = false;
          });
          // Workflow still opens additional_nominee even with extra_nominee=No —
          // auto-advance those steps when product caps at 3 nominees.
          if (await maybeAutoSkipAdditionalNomineeForMaxThree(s)) {
            return;
          }
          await checkAndHandleRedirect(s);
        }
      } else {
        const ctx = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
        const position = toStrOrNull(ctx?.position)?.toLowerCase() ?? '';
        const pageLabel = toStrOrNull(ctx?.page?.data?.label)?.toLowerCase() ?? '';
        const pathSegment = getKycPostPathSegment(ctx).toLowerCase();
        const errMsg = resolveSubmitErrorMessage({
          position,
          pageLabel,
          pathSegment,
          statusCode: res.statusCode,
          bodyStr: res.body,
          body,
        });
        if (isPanKycStep(position, pageLabel)) {
          showPanStepKycPostFeedback(errMsg, {isError: true});
        } else {
          Fluttertoast.showToast({msg: errMsg, gravity: 'TOP'});
        }
        if (mounted()) {
          clearSubmitFreeze();
          setState(() => {
            h.submitLoading = false;
          });
        }
      }
    } catch (_) {
      Fluttertoast.showToast({msg: 'Submission failed', gravity: 'TOP'});
      if (mounted()) {
        clearSubmitFreeze();
        setState(() => {
          h.submitLoading = false;
        });
      }
    }
  }

  function isPanKycStep(position: string | null | undefined, pageLabel: string | null | undefined): boolean {
    return usesDdMmYyyyPanDateStep(position, pageLabel);
  }

  /** `kyc-post-v2` body: prefer API `msg` / `message` as returned (e.g. PAN step). */
  function kycPostV2UserMessage(body: AnyMap | null | undefined): string | null {
    if (body == null) return null;
    for (const key of ['msg', 'message', 'error']) {
      const v = body[key];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
    return null;
  }

  function resolveSubmitErrorMessage(opts: {
    position: string;
    pageLabel: string;
    pathSegment: string;
    statusCode: number;
    bodyStr: string;
    body?: AnyMap | null;
  }): string {
    const errMsg = kycPostV2UserMessage(opts.body) ?? errorMessageFromResponse(opts.statusCode, opts.bodyStr);
    if (KD.isDetailspanKycStep(opts.position, opts.pageLabel) || opts.pathSegment.toLowerCase().startsWith('detailspan')) {
      return KD.detailspanPanDuplicateFriendlyMessage(kycPostV2UserMessage(opts.body)) ?? errMsg;
    }
    return errMsg;
  }

  /** PAN already saved on this session — refresh workflow and continue (web parity). */
  async function tryRecoverPanVerifyAlreadyExists(s: AppStore, opts: {submissionData: AnyMap}): Promise<boolean> {
    await s.fetchUserDetails();
    const ud = CF.userDetailsDataMap(s.userDetails);
    if (!KD.panNumberMatchesUserDetails(opts.submissionData, ud)) {
      debugPrint('[HomePage] PAN already exists but user-details PAN mismatch — not recovering');
      return false;
    }
    debugPrint('[HomePage] PAN already on this journey — refreshing get-context to advance');
    await s.fetchWorkflowFieldsWithAuth(widget.company, widget.workflowName, '');
    return s.errorWithAuth == null;
  }

  function showPanStepKycPostFeedback(message: string, opts: {isError: boolean}): void {
    if (!mounted()) return;
    // API often returns message "working" on success — not user-facing copy.
    if (message.trim().toLowerCase() === 'working') return;
    setState(() => {
      h.panStepApiFeedback = message;
      h.panStepApiFeedbackIsError = opts.isError;
    });
    Fluttertoast.showToast({
      msg: message,
      long: true,
      gravity: 'TOP',
      backgroundColor: opts.isError ? RED_700 : GREEN_700,
      textColor: '#FFFFFF',
    });
  }

  /**
   * Extract user-facing error message from API response body.
   * Supports common keys: msg, message, error, detail (string or list).
   */
  function errorMessageFromResponse(statusCode: number, bodyStr: string): string {
    if (bodyStr.trim().length === 0) {
      return friendlyApiErrorMessage(null, {statusCode});
    }
    try {
      const body = decodeJsonMapOrNull(bodyStr);
      if (body == null) {
        return friendlyApiErrorMessage(bodyStr, {statusCode});
      }
      const msg = body.msg ?? body.message ?? body.error;
      if (msg != null) {
        if (typeof msg === 'string') {
          return friendlyApiErrorMessage(msg, {statusCode});
        }
        if (Array.isArray(msg) && msg.length > 0) {
          return friendlyApiErrorMessage(toStr(msg[0]), {statusCode});
        }
      }
      const detail = body.detail;
      if (typeof detail === 'string') {
        return friendlyApiErrorMessage(detail, {statusCode});
      }
      if (Array.isArray(detail) && detail.length > 0) {
        return friendlyApiErrorMessage(toStr(detail[0]), {statusCode});
      }
    } catch (_) {
      return friendlyApiErrorMessage(bodyStr, {statusCode});
    }
    return friendlyApiErrorMessage(bodyStr, {statusCode});
  }

  /** Builds kyc-post-v2 path segment from get-context page: page.name + page.id (e.g. mobile_otp2, email3). */
  function getKycPostPathSegment(ctx: AnyMap | null | undefined): string {
    const page = isMap(ctx?.page) ? ctx!.page : null;
    if (page != null) {
      const name = page.name != null ? toStr(page.name) : '';
      const id = page.id != null ? toStr(page.id) : '';
      if (name.length > 0 || id.length > 0) return `${name}${id}`;
    }
    const pos = ctx?.position != null ? toStr(ctx.position) : '';
    const idx = ctx?.index != null ? toStr(ctx.index) : '';
    return pos.length > 0 || idx.length > 0 ? `${pos}${idx}` : '';
  }

  /**
   * Bank `kyc-post-v2` can return HTTP 200 with `success: false` and either:
   * - `msg` containing "Penny Drop Verified" (confirm save), or
   * - eKYC name-mismatch / retry flow with top-level `pennydrop` (e.g. unsuccessful message).
   */
  function isBankKycPostStep(position: string, lowerPath: string): boolean {
    return lowerPath.startsWith('bank') || position === 'bank' || position === 'bank_details';
  }

  function isSignUploadKycPostStep(position: string, lowerPath: string): boolean {
    return lowerPath.startsWith('sign_upload') || position === 'sign_upload';
  }

  function isPanUploadKycPostStep(position: string, lowerPath: string): boolean {
    return lowerPath.startsWith('pan_upload') || position === 'pan_upload';
  }

  const forcedBlankRejectionFields = new Set<string>([
    'reject_reason_pan_upload',
    'rejected_by_pan_upload',
    'reject_reason_signature_upload',
    'rejected_by_signature_upload',
  ]);

  function isSaveFilesApiDocumentUploadStep(position: string, lowerPath: string): boolean {
    return isSignUploadKycPostStep(position, lowerPath) || isPanUploadKycPostStep(position, lowerPath);
  }

  const signUploadBoidValue = 'CDSL';

  function signUploadPrepopulateSourceKeys(prepopulateValue: any): string[] {
    if (prepopulateValue == null) return [];
    if (typeof prepopulateValue === 'string') {
      const s = prepopulateValue.trim();
      return s.length === 0 ? [] : [s];
    }
    if (Array.isArray(prepopulateValue)) {
      const keys: string[] = [];
      for (const item of prepopulateValue) {
        if (isMap(item)) {
          const v = item.value != null ? toStr(item.value).trim() : item.label != null ? toStr(item.label).trim() : null;
          if (v != null && v.length > 0) keys.push(v);
        } else if (item != null && toStr(item).trim().length > 0) {
          keys.push(toStr(item).trim());
        }
      }
      return keys;
    }
    return [];
  }

  function resolveSignUploadFieldValue(field: AnyMap, formData: AnyMap): string {
    const name = toStrOrNull(field.name) ?? '';
    const formValue = formData[name];
    if (formValue != null && toStr(formValue).trim().length > 0) {
      return toStr(formValue);
    }

    const fieldValue = field.value;
    if (fieldValue != null && toStr(fieldValue).trim().length > 0) {
      return toStr(fieldValue);
    }

    if (field.isPrepopulate === true) {
      for (const source of signUploadPrepopulateSourceKeys(field.prepopulateValue)) {
        const v = formData[source];
        if (v != null && toStr(v).trim().length > 0) {
          return toStr(v);
        }
      }
    }

    return '';
  }

  function buildSignUploadKycPostBody(opts: {fieldList: any[]; formData: AnyMap}): AnyMap {
    const payload: AnyMap = {};

    for (const raw of opts.fieldList) {
      if (!isMap(raw)) continue;
      const field: AnyMap = {...raw};
      const name = toStrOrNull(field.name);
      if (name == null || name.length === 0) continue;

      const type = (toStrOrNull(field.type) ?? '').toLowerCase();
      if (type === 'file' || type === 'button' || type === 'hidden') continue;

      if (name === 'boid') {
        payload[name] = signUploadBoidValue;
        continue;
      }

      if (forcedBlankRejectionFields.has(name)) {
        payload[name] = '';
        continue;
      }

      payload[name] = resolveSignUploadFieldValue(field, opts.formData);
    }

    return payload;
  }

  /** Bank step Proceed (penny drop confirm) — web parity payload. */
  function buildBankProceedConfirmPayload(formData: AnyMap): AnyMap {
    const fieldKeys = ['ifsc', 'micr1', 'account_number', 'reenter_account_number', 'bank_add', 'account_type'];
    const payload: AnyMap = {
      save: true,
      middlewareCall: false,
    };
    for (const key of fieldKeys) {
      if (Object.prototype.hasOwnProperty.call(formData, key) && formData[key] != null) {
        payload[key] = formData[key];
      }
    }
    return payload;
  }

  const bank18LogTag = '[Bank18]';

  function logBank18Api(opts: {
    phase: string;
    endpoint: string;
    payload?: AnyMap | null;
    statusCode?: number | null;
    responseBody?: string | null;
    responseJson?: AnyMap | null;
  }): void {
    debugPrint('');
    debugPrint(`════ ${bank18LogTag} ${opts.phase} ════`);
    debugPrint(`${bank18LogTag} URL: ${opts.endpoint}`);
    if (opts.payload != null) {
      debugPrint(`${bank18LogTag} PAYLOAD: ${JSON.stringify(opts.payload)}`);
    }
    if (opts.statusCode != null) {
      debugPrint(`${bank18LogTag} HTTP: ${opts.statusCode}`);
      if (opts.responseBody != null && opts.responseBody.length > 0) {
        debugPrint(`${bank18LogTag} RESPONSE: ${opts.responseBody}`);
      } else if (opts.responseJson != null) {
        const rj = opts.responseJson;
        debugPrint(
          `${bank18LogTag} RESPONSE: success=${toStr(rj.success)} ` +
            `index=${toStr(isMap(rj.context) ? rj.context.index : null)} ` +
            `position=${toStr(isMap(rj.context) ? rj.context.position : null)}`,
        );
      }
    }
    debugPrint('════════════════════════════════');
    debugPrint('');
  }

  function isPennyDropVerifiedAwaitingSaveOrRetake(body: AnyMap | null | undefined): boolean {
    if (body == null) return false;
    const msg = body.msg != null ? toStr(body.msg).toLowerCase().trim() : '';
    if (msg.includes('penny drop verified')) return true;
    const pennydrop = body.pennydrop != null ? toStr(body.pennydrop).trim() : '';
    if (pennydrop.length > 0) return true;
    return false;
  }

  function pennyDropSaveRetakeDialogTitle(body: AnyMap): string {
    const msg = body.msg != null ? toStr(body.msg).toLowerCase().trim() : '';
    if (msg.includes('penny drop verified')) {
      return 'Penny drop verification successful';
    }
    return 'Penny drop failed';
  }

  function formatPennyDropApiMessage(raw: string): string {
    return raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  function pennyDropVerifiedDialogMessage(body: AnyMap): string {
    const data = body.data;
    const pennyRaw = isMap(data) ? (data.pennydrop_accountholder_name != null ? toStr(data.pennydrop_accountholder_name).trim() : '') : '';
    const panSrc = formNotifier.formData.name ?? formNotifier.formData.full_name ?? formNotifier.formData.pan_name;
    const panRaw = panSrc != null ? toStr(panSrc).trim() : '';

    const pennyName = pennyRaw.toUpperCase();
    const panName = panRaw.toUpperCase();

    if (pennyName.length === 0 && panName.length === 0) {
      return 'Proceed with These Bank Details or Modify Penny Drop Verification';
    }

    const bankHolder = pennyName.length > 0 ? pennyName : panName;
    const panPageName = panName.length > 0 ? panName : bankHolder;

    return `Your Pennydrop name "${bankHolder}" and the name on PAN page "${panPageName}" are verified.\n\nPenny Drop Verified`;
  }

  function pennyDropDialogMessage(body: AnyMap): string {
    const msg = body.msg != null ? toStr(body.msg).trim() : '';
    const pennydrop = body.pennydrop != null ? toStr(body.pennydrop).trim() : '';
    const raw = msg.length > 0 ? msg : pennydrop;

    if (raw.length === 0) {
      return 'Proceed with These Bank Details or Modify Penny Drop Verification';
    }

    if (raw.toLowerCase().includes('penny drop verified')) {
      return pennyDropVerifiedDialogMessage(body);
    }

    const formatted = formatPennyDropApiMessage(raw);
    if (formatted.toLowerCase() === 'error') {
      return 'Bank Penny Drop Verification failed. Please upload valid bank proof to proceed';
    }

    return formatted;
  }

  function showPennyDropVerifiedSaveRetakeDialog(title: string, opts: {message: string}): Promise<string | null> {
    const isVerifiedSuccess = title.toLowerCase().includes('verification successful');
    return new Promise<string | null>(resolve => {
      h.pennyDialog = {
        title,
        message: opts.message,
        isVerifiedSuccess,
        resolve: (v: string | null) => {
          h.pennyDialog = null;
          rerender();
          resolve(v);
        },
      };
      rerender();
    });
  }

  async function afterKycPostV2Success(
    s: AppStore,
    body: AnyMap | null | undefined,
    submissionData: AnyMap,
    opts: {getContextPostBody?: AnyMap | null; logBank18GetContext?: boolean} = {},
  ): Promise<void> {
    const {getContextPostBody} = opts;
    const logBank18GetContext = opts.logBank18GetContext ?? false;
    const ctxBeforeRefresh = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
    const submitPosition = toStrOrNull(ctxBeforeRefresh?.position)?.toLowerCase() ?? '';
    const submitLabel = toStrOrNull(ctxBeforeRefresh?.page?.data?.label)?.toLowerCase() ?? '';
    if (submissionIncludedRpdReturn(s, submissionData, {position: submitPosition, pageLabel: submitLabel})) {
      clearRpdReturnState(s);
    }

    await StorageService.setUserStep(toStrOrNull(body?.step) ?? '');
    // Persist email for OTP UI before any reset (payload + snapshot still valid here).
    const formSnapshot: AnyMap = {...formNotifier.formData};
    const emailSrc = submissionData.email ?? submissionData.email_id ?? submissionData.emailId;
    const emailFromPayload = emailSrc != null ? toStr(emailSrc).trim() : '';
    if (emailFromPayload.includes('@')) {
      h.persistedEmailForOtp = emailFromPayload;
    } else {
      const resolved = resolveEmailForOtpUi(formSnapshot);
      if (resolved.includes('@')) h.persistedEmailForOtp = resolved;
    }
    // Do not reset the form before get-context: the UI would show empty fields while the
    // request is in flight even though the save succeeded. Clear + rehydrate only after fresh context.
    const getContextPath = `/api/get-context/${widget.company}/${widget.workflowName}`;
    const contextPayload = getContextPostBody ?? {};
    if (logBank18GetContext) {
      logBank18Api({
        phase: 'STEP-3 → get-context REQUEST',
        endpoint: getContextPath,
        payload: contextPayload,
      });
    }
    await s.fetchWorkflowFieldsWithAuth(widget.company, widget.workflowName, '', {postBody: getContextPostBody});
    if (logBank18GetContext) {
      logBank18Api({
        phase: 'STEP-3 → get-context RESPONSE',
        endpoint: getContextPath,
        statusCode: 200,
        responseJson: isMap(s.fieldsWithAuth) ? {...s.fieldsWithAuth} : null,
      });
    }
    if (mounted() && s.errorWithAuth != null) {
      if (s.hasPdfDocumentEncryptedContextError) {
        recoverFromPdfDocumentEncryptedError(s);
        finishSubmitTransition({store: s, applyFreshStep: false});
        return;
      }
      if (s.hasInvalidPanContextError) {
        recoverFromInvalidPanContextError(s);
        return;
      }
      if (isHtmlOrInfraErrorBody(s.errorWithAuth)) {
        debugPrint('[HomePage] get-context failed with server/HTML response — keeping session (not clearing storage)');
        Fluttertoast.showToast({
          msg: 'Could not refresh your progress. Please try again.',
          gravity: 'TOP',
        });
        finishSubmitTransition({store: s, applyFreshStep: false});
        return;
      }
      await clearCookiesAndRefresh();
      Fluttertoast.showToast({msg: s.errorWithAuth ?? 'Session updated. Please continue.', gravity: 'TOP'});
      finishSubmitTransition({store: s, applyFreshStep: false});
      return;
    }
    if (mounted()) {
      const authResponse = s.fieldsWithAuth;
      if (responseIndicatesKycCompleted(authResponse)) {
        clearSubmitFreeze();
        setState(() => {
          h.submitLoading = false;
        });
        await navigateToKycCompletedIfNeeded(s);
        return;
      }
    }
    if (mounted()) {
      await delay(300);
      await applyFreshStepAfterSuccessfulSubmit(s);
      const ctx = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth : null;
      const contextMap = isMap(ctx?.context) ? ctx!.context : null;
      const pos = toStrOrNull(contextMap?.position)?.toLowerCase() ?? '';
      if (pos === 'bank' || pos === 'bank_details') {
        formNotifier.applyFullConditionalFlowEvaluation();
        debugPrint('[Bank18] Still on bank — bank_upload path via conditional flow');
      }
      if (pos === 'email_otp') {
        applyPersistedEmailToForm();
        debugPrint(`[HomePage] email_otp: applied persisted email for UI: ${h.persistedEmailForOtp}`);
      }
      clearSubmitFreeze();
      setState(() => {
        h.submitLoading = false;
      });
      await checkAndHandleRedirect(s);
    }
  }


  async function handleCommonSubmit(skipValidation: boolean): Promise<void> {
    debugPrint(`[HomePage] _handleCommonSubmit CALLED - skipValidation=${skipValidation}`);
    const s = store;
    h.panStepApiFeedback = '';
    h.panStepApiFeedbackIsError = false;

    const submitStep = submitValidationStep(s);
    const submitActiveFields = getActiveFields(s);
    const submitFieldList = (submitActiveFields?.fields as any[] | null | undefined) ?? [];
    if (
      enforceFatcaTaxResidencyNoOnSubmit({
        position: submitStep.position,
        pageLabel: submitStep.pageLabel,
        fieldList: submitFieldList,
      })
    ) {
      return;
    }

    // RN-only: commit a focused DD/MM/YYYY text input before reading form data.
    commitPendingDateInputs();

    // Enforce Terms & Conditions on mobile step for authenticated flows
    if (!skipValidation) {
      const withAuth = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth : null;
      const ctx = isMap(withAuth?.context) ? withAuth!.context : null;

      let position = toStrOrNull(ctx?.position)?.toLowerCase() ?? '';
      let label = toStrOrNull(ctx?.page?.data?.label)?.toLowerCase() ?? '';

      if (position.length === 0 || label.length === 0) {
        const workflow = isMap(s.fields) ? s.fields : null;
        position = (toStrOrNull(workflow?.position) ?? position).toLowerCase();
        label = (toStrOrNull(workflow?.data?.label) ?? label).toLowerCase();
      }

      debugPrint(`[HomePage] _handleCommonSubmit position=${position} label=${label}`);

      const isMobileScreen = position === 'mobile' && label === 'mobile';
      if (isMobileScreen) {
        if (!h.termsAccepted) {
          setState(() => {
            h.showTermsError = true;
            h.showMobileError = false;
          });
          Fluttertoast.showToast({
            msg: 'Please accept the Terms & Conditions to continue',
            long: true,
            gravity: 'TOP',
            backgroundColor: RED_700,
            textColor: '#FFFFFF',
          });
          return;
        }
        const mobile = formNotifier.formData.mobile ?? formNotifier.formData.phone ?? formNotifier.formData.mobile_number ?? '';
        const digits = toStr(mobile).replace(/\D/g, '');
        if (digits.length !== 10 || !/^[6-9]/.test(digits)) {
          setState(() => {
            h.showMobileError = true;
            h.showTermsError = false;
          });
          Fluttertoast.showToast({
            msg: 'Please enter a valid 10-digit mobile number',
            long: true,
            gravity: 'TOP',
            backgroundColor: RED_700,
            textColor: '#FFFFFF',
          });
          return;
        }
      }
    }

    if (!skipValidation) {
      const step = submitValidationStep(s);
      const isValid = formNotifier.validate({
        company: widget.company,
        position: step.position,
        pageLabel: step.pageLabel,
      });
      debugPrint(`[HomePage] Form validation result: ${isValid}`);
      if (!isValid) {
        debugPrint('[HomePage] Validation failed, returning early');
        debugPrint(`[HomePage] Validation errors: ${JSON.stringify(formNotifier.errors)}`);
        showValidationFailureToast();
        return;
      }
      if (toastAndBlockIfAdditionalNomineeTotalNot100(s)) return;
    }
    Keyboard.dismiss();
    debugPrint('[HomePage] _handleCommonSubmit START');
    setState(() => {
      beginSubmitTransition(s);
      h.submitLoading = true;
    });
    try {
      const withAuth = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth : null;
      const ctx = isMap(withAuth?.context) ? withAuth!.context : null;
      const pathSegment = getKycPostPathSegment(ctx);
      if (pathSegment.length === 0) {
        Fluttertoast.showToast({msg: 'Invalid step. Please refresh.', gravity: 'TOP'});
        if (mounted()) {
          clearSubmitFreeze();
          setState(() => {
            h.submitLoading = false;
          });
        }
        return;
      }

      const currentPosition = (toStrOrNull(ctx?.position)?.toLowerCase() ?? '').trim();
      const lowerPath = pathSegment.toLowerCase();

      const data = await prepareFormData(skipValidation);
      delete data.save;

      // PAN verify (`pan10`): curl/web body only — trim name/PAN (trailing space breaks verify).
      if (KD.isPanVerifyKycPostStep(currentPosition, lowerPath)) {
        const normalized = KD.buildPanVerifyKycPostBody(data);
        for (const k of Object.keys(data)) delete data[k];
        Object.assign(data, normalized);
        debugPrint(`[HomePage] PAN verify POST body: ${JSON.stringify(data)}`);
      }

      // Initial email capture step: backend expects a trimmed body (email + a few fields).
      // Must NOT run on `email_otp` — pathSegment e.g. `email_otp4` still starts with `email`,
      // and clearing here would drop the OTP field and break verify_otp on the server.
      const isEmailOtpStep = currentPosition === 'email_otp' || lowerPath.startsWith('email_otp');
      const isEmailOnlySubmitStep =
        !isEmailOtpStep &&
        (currentPosition === 'email' || (lowerPath.startsWith('email') && !lowerPath.startsWith('email_otp')));
      if (isEmailOnlySubmitStep) {
        const emailSrc = data.email ?? data.email_id ?? data.emailId;
        const resolvedEmail = emailSrc != null ? toStr(emailSrc).trim() : '';
        const selectDependency = toStr(data.select__dependency ?? 'Self').trim();
        const branchReferenceCode = toStr(data.branch_reference_code ?? '');
        const panNumber1 = toStr(data.pan_number1 ?? '');
        for (const k of Object.keys(data)) delete data[k];
        data.email = resolvedEmail;
        data.select__dependency = selectDependency.length === 0 ? 'Self' : selectDependency;
        data.branch_reference_code = branchReferenceCode;
        data.pan_number1 = panNumber1;
      }

      // DigiLocker: backend expects `save: true` on kyc-post-v2 (e.g. `/digilocker9`).
      // Do not require `?verify=digilocker` on the app route — that flag is often only sent to
      // get-context, so `widget.queryParams` is empty here even after a successful verify flow.
      const onDigilockerStep = currentPosition === 'digilocker' || lowerPath.startsWith('digilocker');
      if (onDigilockerStep) {
        data.save = true;
        debugPrint('[HomePage] DigiLocker step: save=true on kyc-post-v2');
      }

      const pageLabelForSubmit = toStrOrNull(ctx?.page?.data?.label);
      if (FV.isNomineeExtendedUiStep(currentPosition, pageLabelForSubmit)) {
        FV.logNomineeKycPostPayloadDiagnostics({
          data,
          position: currentPosition,
          pageLabel: pageLabelForSubmit,
        });
      }

      debugPrint(`[HomePage] _handleCommonSubmit data keys=${Object.keys(data).length} pathSegment=${pathSegment}`);

      // Check saveFilesAPI flag from context.page
      const page = isMap(ctx?.page) ? ctx!.page : null;
      const saveFilesAPI = page?.saveFilesAPI === true;
      debugPrint(`[HomePage] saveFilesAPI flag: ${saveFilesAPI}`);

      // Check if form has file fields - if yes, use multipart/form-data
      const activeFields = getActiveFields(s);
      const fieldList = (activeFields?.fields as any[] | null | undefined) ?? [];
      const hasFile = fieldList.some(f => isMap(f) && f.type === 'file') || Object.values(data).some(v => isPickedFile(v));

      const endpoint = `/api/kyc-post-v2/${widget.company}/${widget.workflowName}/${pathSegment}`;
      const fullUrl = `${EnvConfig.baseUrl}${endpoint}`;
      debugPrint(`[HomePage] _handleCommonSubmit hasFile=${hasFile}`);
      debugPrint(`[HomePage] _handleCommonSubmit FULL URL: ${fullUrl}`);
      debugPrint(`[HomePage] _handleCommonSubmit ENDPOINT: ${endpoint}`);

      // If saveFilesAPI is true, upload files separately first
      if (hasFile && saveFilesAPI) {
        debugPrint('[HomePage] saveFilesAPI=true: Uploading files separately to /api/upload_files_new');
        const filesToUpload: Array<[string, PickedFile]> = [];

        // Extract files from data
        for (const [k, v] of Object.entries(data)) {
          if (isPickedFile(v)) {
            filesToUpload.push([k, v]);
          }
        }

        // Upload each file separately to /api/upload_files_new (token set in ApiClient; 401 triggers refresh + retry)
        for (const [fileKey, file] of filesToUpload) {
          // e.g., signature_upload, pan_upload, etc.
          try {
            debugPrint(`[HomePage] Uploading file: ${fileKey} = ${file.path}`);
            const uploadRes = await ApiClient.postMultipart(
              async () => ({
                method: 'POST' as const,
                url: `${EnvConfig.baseUrl}/api/upload_files_new`,
                fields: {},
                files: [{field: fileKey, path: file.path, filename: file.name, contentType: file.mimeType}],
                headers: {accept: '*/*'},
              }),
              {skipRefreshOn401: true},
            );
            debugPrint(`[HomePage] File upload response for ${fileKey}: ${uploadRes.statusCode}`);

            if (uploadRes.statusCode < 200 || uploadRes.statusCode >= 300) {
              debugPrint(`[HomePage] File upload failed for ${fileKey}: ${uploadRes.body}`);
              Fluttertoast.showToast({
                msg: `Failed to upload ${fileKey}`,
                gravity: 'TOP',
              });
              if (mounted()) {
                setState(() => {
                  h.submitLoading = false;
                });
              }
              return;
            }
          } catch (e) {
            debugPrint(`[HomePage] Error uploading file ${fileKey}: ${e}`);
            Fluttertoast.showToast({
              msg: `Error uploading file: ${e}`,
              gravity: 'TOP',
            });
            if (mounted()) {
              setState(() => {
                h.submitLoading = false;
              });
            }
            return;
          }
        }

        // Remove files from data after successful upload
        for (const [key] of filesToUpload) {
          delete data[key];
        }
        debugPrint('[HomePage] Files uploaded successfully, continuing with form submission');
      }

      if (isSaveFilesApiDocumentUploadStep(currentPosition, lowerPath)) {
        const documentUploadBody = buildSignUploadKycPostBody({
          fieldList,
          formData: {...formNotifier.formData},
        });
        for (const k of Object.keys(data)) delete data[k];
        Object.assign(data, documentUploadBody);
        debugPrint(`[HomePage] document upload step payload: ${JSON.stringify(data)}`);
      }

      let res: HttpResponse;
      if (hasFile && !saveFilesAPI) {
        // Use multipart/form-data for file uploads (existing flow when saveFilesAPI=false)
        debugPrint('[HomePage] Using multipart/form-data (file upload detected, saveFilesAPI=false)');
        res = await ApiClient.postMultipart(async () => {
          const fields: Record<string, string> = {};
          const files: Array<{field: string; path: string; filename?: string; contentType?: string}> = [];
          const nomineeStep = FV.isNomineeExtendedUiStep(currentPosition, pageLabelForSubmit);
          for (const [k, v] of Object.entries(data)) {
            if (isPickedFile(v)) {
              files.push({field: k, path: v.path, filename: v.name, contentType: v.mimeType});
              debugPrint(`[HomePage] Added file: ${k} = ${v.path}`);
            } else if (typeof v === 'boolean') {
              fields[k] = String(v);
            } else if (v != null && (toStr(v).length > 0 || nomineeStep || FV.shouldSendEmptyNomineeKycPostField(k))) {
              fields[k] = toStr(v);
            }
          }
          debugPrint(`[HomePage] multipart fields keys=${JSON.stringify(Object.keys(fields))} files=${JSON.stringify(files.map(f => f.field))}`);
          if (nomineeStep) {
            FV.logNomineeKycPostPayloadDiagnostics({
              data,
              position: currentPosition,
              pageLabel: pageLabelForSubmit,
              wireMultipartFields: fields,
            });
          }
          return {method: 'POST' as const, url: fullUrl, fields, files, headers: {}};
        });
      } else {
        // Use JSON for non-file submissions (or after files uploaded separately)
        debugPrint('[HomePage] Using application/json (no files or files already uploaded)');
        if (FV.isNomineeExtendedUiStep(currentPosition, pageLabelForSubmit)) {
          const wire: Record<string, string> = {};
          for (const [k, v] of Object.entries(data)) {
            if (isPickedFile(v)) continue;
            wire[k] = v != null ? toStr(v) : '';
          }
          FV.logNomineeKycPostPayloadDiagnostics({
            data,
            position: currentPosition,
            pageLabel: pageLabelForSubmit,
            wireMultipartFields: wire,
          });
        }
        if (isBankKycPostStep(currentPosition, lowerPath)) {
          logBank18Api({
            phase: 'STEP-1 → kyc-post-v2 REQUEST',
            endpoint,
            payload: {...data},
          });
        }
        res = await ApiClient.post(endpoint, {
          body: data,
          headers: {'Content-Type': 'application/json'},
        });
      }
      let body: AnyMap | null;
      try {
        body = decodeJsonMapOrNull(res.body);
      } catch (_) {
        body = null;
      }
      if (isBankKycPostStep(currentPosition, lowerPath)) {
        logBank18Api({
          phase: 'STEP-1 → kyc-post-v2 RESPONSE',
          endpoint,
          statusCode: res.statusCode,
          responseBody: res.body,
          responseJson: body,
        });
      }
      const currentPageLabel = toStrOrNull(ctx?.page?.data?.label)?.toLowerCase() ?? '';
      const isPanStep = isPanKycStep(currentPosition, currentPageLabel) || lowerPath.startsWith('pan');
      const isSuccess = res.statusCode >= 200 && res.statusCode < 300 && body?.success === true;
      if (isSuccess) {
        if (isPanStep) {
          const apiMsg = kycPostV2UserMessage(body);
          if (apiMsg != null && apiMsg.length > 0) {
            showPanStepKycPostFeedback(apiMsg, {isError: false});
          }
        }
        await afterKycPostV2Success(s, body, data);
      } else if (res.statusCode >= 200 && res.statusCode < 300 && isPennyDropVerifiedAwaitingSaveOrRetake(body)) {
        if (mounted()) {
          setState(() => {
            h.submitLoading = false;
          });
        }
        const dialogTitle = pennyDropSaveRetakeDialogTitle(body!);
        const dialogMessage = pennyDropDialogMessage(body!);
        const choice = await showPennyDropVerifiedSaveRetakeDialog(dialogTitle, {message: dialogMessage});
        if (!mounted()) return;
        if (choice == null) return;
        setState(() => {
          h.submitLoading = true;
        });
        const retryPayload: AnyMap = {...data};
        delete retryPayload.save;
        delete retryPayload.retake;
        delete retryPayload.middlewareCall;

        let postPayload: AnyMap;
        if (choice === 'save') {
          postPayload = buildBankProceedConfirmPayload(data);
        } else {
          retryPayload.retake = true;
          postPayload = retryPayload;
        }
        logBank18Api({
          phase: choice === 'save' ? 'STEP-2 PROCEED → kyc-post-v2 REQUEST' : 'STEP-2 MODIFY → kyc-post-v2 REQUEST',
          endpoint,
          payload: postPayload,
        });
        const res2 = await ApiClient.post(endpoint, {
          body: postPayload,
          headers: {'Content-Type': 'application/json'},
        });
        let body2: AnyMap | null;
        try {
          body2 = decodeJsonMapOrNull(res2.body);
        } catch (_) {
          body2 = null;
        }
        logBank18Api({
          phase: choice === 'save' ? 'STEP-2 PROCEED → kyc-post-v2 RESPONSE' : 'STEP-2 MODIFY → kyc-post-v2 RESPONSE',
          endpoint,
          statusCode: res2.statusCode,
          responseBody: res2.body,
          responseJson: body2,
        });
        const httpOk = res2.statusCode >= 200 && res2.statusCode < 300;
        if (choice === 'save' && httpOk) {
          await afterKycPostV2Success(s, body2 ?? {success: true}, postPayload, {logBank18GetContext: true});
        } else if (choice === 'retake' && httpOk && body2?.success === true) {
          await afterKycPostV2Success(s, body2, postPayload);
        } else {
          const err2 = kycPostV2UserMessage(body2) ?? errorMessageFromResponse(res2.statusCode, res2.body);
          Fluttertoast.showToast({msg: err2, gravity: 'TOP'});
          if (mounted()) {
            clearSubmitFreeze();
            setState(() => {
              h.submitLoading = false;
            });
          }
        }
      } else if (
        isPanStep &&
        KD.isPanNumberAlreadyExistsResponse(body) &&
        (await tryRecoverPanVerifyAlreadyExists(s, {submissionData: data}))
      ) {
        debugPrint('[HomePage] PAN verify: already exists — treated as success, advancing');
        showPanStepKycPostFeedback('PAN verified successfully', {isError: false});
        await afterKycPostV2Success(s, {success: true, message: 'working'}, data);
      } else {
        const errMsg = resolveSubmitErrorMessage({
          position: currentPosition,
          pageLabel: currentPageLabel,
          pathSegment: lowerPath,
          statusCode: res.statusCode,
          bodyStr: res.body,
          body,
        });
        if (isPanStep) {
          showPanStepKycPostFeedback(errMsg, {isError: true});
        } else {
          Fluttertoast.showToast({msg: errMsg, gravity: 'TOP'});
        }
        if (mounted()) {
          clearSubmitFreeze();
          setState(() => {
            h.submitLoading = false;
          });
        }
      }
    } catch (e) {
      Fluttertoast.showToast({msg: 'Something went wrong. Please try again.', gravity: 'TOP'});
      if (mounted()) {
        clearSubmitFreeze();
        setState(() => {
          h.submitLoading = false;
        });
      }
    }
  }

  /**
   * When [AppStore.errorWithAuth] is set to an HTML/5xx page, the session is usually still valid;
   * wiping storage only forces an unauthenticated workflow load (`hasToken=false`).
   */
  function isHtmlOrInfraErrorBody(err: string | null | undefined): boolean {
    if (err == null || err.length === 0) return false;
    const t = err.trim().toLowerCase();
    return (
      t.startsWith('<!doctype') ||
      t.includes('<html') ||
      t.includes('internal server error') ||
      t.includes('502 bad gateway') ||
      t.includes('503 service unavailable') ||
      t.includes('504 gateway')
    );
  }

  /** Keep user on the current upload step after backend rejects encrypted/closed PDF. */
  function recoverFromPdfDocumentEncryptedError(s: AppStore): void {
    debugPrint('[HomePage] PDF document closed/encrypted — staying on upload step (not clearing session)');
    s.clearAuthError();

    // Clear file + companion password fields so user can re-upload.
    const active = getActiveFields(s);
    const fieldList = (active?.fields as any[] | null | undefined) ?? [];
    for (const f of fieldList) {
      if (!isMap(f)) continue;
      if (toStrOrNull(f.type) !== 'file') continue;
      const name = toStrOrNull(f.name);
      if (name == null || name.length === 0) continue;
      formNotifier.handleChange(name, null, {type: 'file'});
      formNotifier.handleChange(`${name}_pass`, null, {type: 'text'});
    }

    Fluttertoast.showToast({
      msg: kPdfDocumentEncryptedUserMessage,
      gravity: 'TOP',
      long: true,
    });
    if (mounted()) rerender();
  }

  /** Invalid PAN from get-context / KRA — stay on PAN details so user can correct it. */
  function recoverFromInvalidPanContextError(s: AppStore): void {
    const raw = s.errorWithAuth ?? s.lastGetContextRawBody;
    const msg = invalidPanUserFacingMessage(raw);
    debugPrint(`[HomePage] Invalid PAN from get-context — staying on PAN step: ${msg}`);
    s.clearAuthError();
    setState(() => {
      h.panStepApiFeedback = msg;
      h.panStepApiFeedbackIsError = true;
    });
    finishSubmitTransition({store: s, applyFreshStep: false});
  }

  /** Previous nominee landing: `add_nominee` = No + opt-out checkbox ticked. */
  function ensureNomineeLandingDefaultNoChecked(fieldList: any[]): void {
    const addDef = findFieldDefByName(fieldList, FV.kAddNomineeField);
    if (addDef == null) return;

    if (
      FV.isAddNomineeSelectedYes(formNotifier.formData) &&
      FV.nomineeDropoffHasSlot1Data({formData: formNotifier.formData, fields: fieldList})
    ) {
      return;
    }

    const values = addDef.values as any[] | null | undefined;
    const no = FV.resolveKycYesNoOptionValue(values, 'No');
    const currentAdd = toStr(formNotifier.formData[FV.kAddNomineeField] ?? '').trim();
    if (
      currentAdd.length === 0 ||
      CF.isApiFieldPlaceholderValue(currentAdd) ||
      FV.isAddNomineeSelectedYes(formNotifier.formData)
    ) {
      formNotifier.handleChange(FV.kAddNomineeField, no, {
        type: toStrOrNull(addDef.type) ?? 'select',
        validationType: toStrOrNull(addDef.validation),
        validateWith: toStrOrNull(addDef.validateWith),
      });
    }

    if (!CF.isCheckboxCheckedValue(formNotifier.formData[FV.kNomineeOptOutTermsField])) {
      const optOut = findFieldDefByName(fieldList, FV.kNomineeOptOutTermsField);
      formNotifier.handleChange(FV.kNomineeOptOutTermsField, true, {
        type: toStrOrNull(optOut?.type) ?? 'checkbox',
        validationType: toStrOrNull(optOut?.validation),
        validateWith: toStrOrNull(optOut?.validateWith),
      });
    }
    if (mounted()) rerender();
  }

  /** `nominee_percentage` step: auto-assign remaining share so total is 100%. */
  function ensureNomineePercentageStepAuto100(fieldList: any[]): void {
    const pctDefs: AnyMap[] = [];
    for (const f of fieldList) {
      if (!isMap(f)) continue;
      const name = toStrOrNull(f.name) ?? '';
      if (!FV.isNomineePercentageFieldName(name)) continue;
      pctDefs.push({...f});
    }
    if (pctDefs.length === 0) {
      for (const f of fieldList) {
        if (!isMap(f)) continue;
        const name = (toStrOrNull(f.name) ?? '').toLowerCase();
        if (name.length === 0) continue;
        if (
          name === FV.kTotalNomineePercentageField ||
          name === FV.kTotalNomineePercentage2Field ||
          name === FV.kRemainNomineePercentField ||
          name === FV.kRemainNomineePercent2Field
        ) {
          continue;
        }
        if (name.includes('percentage') || name.endsWith('_percent')) {
          pctDefs.push({...f});
        }
      }
    }
    if (pctDefs.length === 0) return;

    let filledSum = 0;
    const emptyNames: string[] = [];
    for (const def of pctDefs) {
      const name = toStrOrNull(def.name) ?? '';
      if (name.length === 0) continue;
      const raw = toStr(formNotifier.formData[name] ?? '').trim();
      if (raw.length === 0 || CF.isApiFieldPlaceholderValue(raw)) {
        emptyNames.push(name);
        continue;
      }
      filledSum += Number.parseFloat(raw) || 0;
    }

    if (emptyNames.length > 0) {
      const remain = Math.max(0, Math.min(100, 100 - filledSum));
      const targetName = emptyNames[0];
      const def = pctDefs.find(d => toStrOrNull(d.name) === targetName) ?? pctDefs[0];
      const value = Number.isInteger(remain) ? String(remain) : String(remain);
      formNotifier.handleChange(targetName, value, {
        type: toStrOrNull(def.type) ?? 'number',
        validationType: toStrOrNull(def.validation),
        validateWith: toStrOrNull(def.validateWith),
      });
      filledSum += remain;
    }

    if (findFieldDefByName(fieldList, FV.kTotalNomineePercentageField) != null) {
      const totalVal = Number.isInteger(filledSum) ? String(filledSum) : String(filledSum);
      const current = toStr(formNotifier.formData[FV.kTotalNomineePercentageField] ?? '').trim();
      if (current !== totalVal) {
        formNotifier.handleChange(FV.kTotalNomineePercentageField, totalVal, {type: 'text'});
      }
    }

    debugPrint(
      `[HomePage] nominee_percentage auto-100 applied (filledSum=${filledSum}, empty=${emptyNames.length})`,
    );
    if (mounted()) rerender();
  }

  /** Apply API `defaultValue` (and dropoff `value`) on unset checkbox / choice fields. */
  function applyApiDefaultValues(fieldList: any[]): void {
    for (const f of fieldList) {
      if (!isMap(f)) continue;
      const name = toStrOrNull(f.name);
      if (name == null || name.length === 0) continue;
      const type = (toStrOrNull(f.type) ?? '').toLowerCase();
      const isChoice = CF.isKycChoiceFieldType(type);
      const isCheckbox = type === 'checkbox';
      if (!isChoice && !isCheckbox) continue;

      const existing = formNotifier.formData[name];
      const forceAddNominee = name === FV.kAddNomineeField;
      if (!forceAddNominee && !shouldApplyPersonalDetailsDefault(existing)) {
        continue;
      }
      if (
        forceAddNominee &&
        existing != null &&
        toStr(existing).trim().length > 0 &&
        !CF.isApiFieldPlaceholderValue(existing)
      ) {
        continue;
      }

      const seed = CF.resolveApiFieldSeedValue(f);
      if (seed == null) continue;
      if (typeof seed === 'string' && seed.trim().length === 0) continue;

      const validation = toStrOrNull(f.validation);
      if (isCheckbox) {
        formNotifier.handleChange(name, CF.isCheckboxCheckedValue(seed), {
          type: 'checkbox',
          validationType: validation,
        });
      } else {
        const values = f.values as any[] | null | undefined;
        const normalized = normalizeRadioToOptions(seed, values);
        formNotifier.handleChange(name, normalized, {
          type: toStrOrNull(f.type) ?? type,
          validationType: validation,
        });
      }
    }
  }

  async function clearCookiesAndRefresh(): Promise<void> {
    await StorageService.clearAll();
    if (mounted()) void loadWorkflow();
  }

  /** Fetch bank details by IFSC code and auto-fill bank fields */
  async function fetchBankDetailsByIfsc(ifsc: string): Promise<void> {
    if (ifsc.length !== 11) {
      debugPrint(`[HomePage] IFSC invalid length: ${ifsc.length}`);
      return;
    }

    try {
      debugPrint(`[HomePage] Fetching bank details for IFSC: ${ifsc}`);
      const res = await ApiClient.post('/get_bank_address_by_ifsc', {
        body: {ifsc},
        headers: {'Content-Type': 'application/json'},
      });

      if (res.statusCode === 200) {
        const data = decodeJsonMapOrNull(res.body);
        debugPrint(`[HomePage] Bank details response: ${JSON.stringify(data)}`);

        if (data != null && mounted()) {
          const bankName = data.bank_name != null ? toStr(data.bank_name).trim() : '';
          if (bankName.length === 0) {
            debugPrint('[HomePage] IFSC lookup returned empty bank_name — invalid IFSC');
            Fluttertoast.showToast({
              msg: 'Invalid IFSC code',
              gravity: 'TOP',
            });
            return;
          }

          // Ensure we are on a bank / bank_details screen before auto-fill
          const s = store;
          const ctx = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
          const position = toStrOrNull(ctx?.position)?.toLowerCase() ?? null;
          const label = toStrOrNull(ctx?.page?.data?.label)?.toLowerCase() ?? null;
          const isBankScreen = position === 'bank' || position === 'bank_details' || label === 'bank';
          if (!isBankScreen) {
            debugPrint(`[HomePage] IFSC response received but not on bank screen (position=${position}, label=${label})`);
            return;
          }

          // Build list of current field names (for this workflow / company)
          const activeFields = getActiveFields(s);
          const fieldList = (activeFields?.fields as any[] | null | undefined) ?? [];
          const fieldNames = new Set<string>();
          for (const f of fieldList) {
            if (isMap(f) && f.name != null) {
              fieldNames.add(toStr(f.name));
            }
          }

          // Map API response fields to actual field names present in current screen
          const updates: AnyMap = {};

          // bank_name → bank_name / bankName
          if (data.bank_name != null) {
            const v = data.bank_name;
            if (fieldNames.has('bank_name')) updates.bank_name = v;
            if (fieldNames.has('bankName')) updates.bankName = v;
          }

          // BRANCH → branch_name / branchName
          if (data.BRANCH != null) {
            const v = data.BRANCH;
            if (fieldNames.has('branch_name')) updates.branch_name = v;
            if (fieldNames.has('branchName')) updates.branchName = v;
          }

          // address → bank_address / bankAddress / bank_add (payload alias on some workflows)
          if (data.address != null) {
            const v = data.address;
            if (fieldNames.has('bank_address')) updates.bank_address = v;
            if (fieldNames.has('bankAddress')) updates.bankAddress = v;
            if (fieldNames.has('bank_add')) updates.bank_add = v;
          }

          // city → bank_city
          if (data.city != null && fieldNames.has('bank_city')) {
            updates.bank_city = data.city;
          }

          // district → bank_district
          if (data.district != null && fieldNames.has('bank_district')) {
            updates.bank_district = data.district;
          }

          // state → bank_state
          if (data.state != null && fieldNames.has('bank_state')) {
            updates.bank_state = data.state;
          }

          // micr → micr / micr1
          if (data.micr != null) {
            const v = data.micr;
            if (fieldNames.has('micr')) updates.micr = v;
            if (fieldNames.has('micr1')) updates.micr1 = v;
          }

          // pincode → bank_pincode
          if (data.pincode != null && fieldNames.has('bank_pincode')) {
            updates.bank_pincode = data.pincode;
          }

          debugPrint(`[HomePage] Bank fields to update (after position & field filter): ${JSON.stringify(updates)}`);

          if (Object.keys(updates).length === 0) {
            debugPrint('[HomePage] No matching bank fields found to update for this screen.');
          } else {
            for (const [k, v] of Object.entries(updates)) {
              debugPrint(`[HomePage] Updating field: ${k} = ${v}`);
            }
            // Use notifier API (not raw map + notifyListeners) so the form rebuilds;
            // avoid handleChange here — it runs processValue and truncates generic text to 35 chars.
            formNotifier.applyExternalFormValues(updates);
            if (mounted()) rerender();
            Fluttertoast.showToast({msg: 'Bank details fetched successfully', gravity: 'TOP'});
            debugPrint(`[HomePage] Auto-filled ${Object.keys(updates).length} bank fields - UI should update now`);
          }
        }
      } else {
        debugPrint(`[HomePage] IFSC lookup failed: ${res.statusCode}`);
        Fluttertoast.showToast({msg: 'Invalid IFSC code', gravity: 'TOP'});
      }
    } catch (e) {
      debugPrint(`[HomePage] IFSC lookup error: ${e}`);
      Fluttertoast.showToast({msg: 'Failed to fetch bank details', gravity: 'TOP'});
    }
  }

  async function handleLogout(): Promise<void> {
    const token = await StorageService.getAccessToken();
    setState(() => {
      h.logoutLoading = true;
    });
    try {
      // Step 1: Call logout API
      if (token != null) {
        try {
          await ApiClient.post('/api/user/logout', {headers: {Authorization: `Bearer ${token}`}});
          debugPrint('[HomePage] Logout API called successfully');
        } catch (e) {
          debugPrint(`[HomePage] Logout API error (continuing anyway): ${e}`);
        }
      }

      // Step 2: Clear all auth tokens and data
      await StorageService.clearAll();
      debugPrint('[HomePage] Tokens cleared');
      clearAuthenticatedStepCache();

      // Post-logout: SSO-only login (user must sign in again via SSO).
      // StorageService.setSsoAutoLoginEnabled(false);
      StorageService.setSsoAutoLoginEnabled(true);
      h.ssoAttempted = false;
      h.ssoInProgress = false;

      // Step 3: Reset form state
      formNotifier.resetForm();

      // Step 4: Reset AppStore state
      const s = store;
      s.resetState();

      // Step 5 (legacy): unauth get-workflow + Start your KYC screen — disabled for SSO-only.

      if (!mounted()) return;
      // Stop logout spinner before SSO modal — user has not submitted KYC yet.
      setState(() => {
        h.logoutLoading = false;
      });
      const ssoOk = await trySsoLoginIfNeeded(s);
      if (!mounted()) return;
      if (ssoOk) {
        await s.fetchWorkflowFieldsWithAuth(widget.company, widget.workflowName, '');
        if (!mounted()) return;
        if (responseIndicatesKycCompleted(s.fieldsWithAuth)) {
          await navigateToKycCompletedIfNeeded(s);
          return;
        }
        if (mounted()) {
          const activeAfter = getActiveFields(s);
          const listAfter = (activeAfter?.fields as any[] | null | undefined) ?? [];
          const flowAfter = activeAfter?.conditionalFlow as any[] | null | undefined;
          formNotifier.updateFields(listAfter, flowAfter, {fieldsWithAuth: s.fieldsWithAuth});
          rerender();
          Fluttertoast.showToast({
            msg: 'Signed in via SSO',
            gravity: 'TOP',
          });
        }
      } else {
        Fluttertoast.showToast({
          msg: 'SSO sign-in required. Enter credentials to continue.',
          gravity: 'TOP',
        });
        await loadWorkflow();
      }
    } catch (e) {
      debugPrint(`[HomePage] Logout error: ${e}`);
      Fluttertoast.showToast({msg: 'Error during logout', gravity: 'TOP'});
    } finally {
      if (mounted()) {
        setState(() => {
          h.logoutLoading = false;
        });
      }
    }
  }


  // ---------- WebView-return partial-loader helpers ----------

  function buildWebViewReturnLoaderContent(): React.ReactElement {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        <Spinner size={36} strokeWidth={3} color={KycTheme.primary} />
        <View style={{height: 16}} />
        <Text style={{fontSize: 14, fontWeight: '500', color: GREY_600, textAlign: 'center'}}>{h.returnFlowMessage}</Text>
      </View>
    );
  }

  /** Header step label: sticky during submit, updates only when the next step is synced. */
  function headerPositionLabel(s: AppStore): string | null {
    if (h.ssoInProgress) {
      return null;
    }

    const settled = resolveSyncedPositionFromStore(s);
    const inTransition = h.submitLoading || s.loadingWithAuth;

    if (!inTransition && settled != null) {
      h.headerDisplayPosition = settled;
      return settled;
    }

    if (inTransition && (h.headerDisplayPosition ?? '').length > 0) {
      return h.headerDisplayPosition;
    }

    if (settled != null) {
      h.headerDisplayPosition = settled;
      return settled;
    }

    return h.headerDisplayPosition;
  }

  /** Workflow position → centered header title. */
  function formatPositionDisplayText(position: string): string {
    return KycStepperBar.formatLabel(position);
  }

  function buildHeaderPositionText(position: string): React.ReactElement {
    return (
      <Text
        numberOfLines={2}
        ellipsizeMode="tail"
        style={{
          textAlign: 'center',
          fontSize: KycTheme.fontSizeBodyLg,
          fontWeight: '600',
          color: KycTheme.textPrimary,
        }}>
        {formatPositionDisplayText(position)}
      </Text>
    );
  }

  function buildAuthenticatedHeaderActions(
    s: AppStore,
    opts: {onRefreshOverride?: (() => void) | null; refreshBusyOverride?: boolean} = {},
  ): React.ReactElement {
    const {onRefreshOverride} = opts;
    const refreshBusyOverride = opts.refreshBusyOverride ?? false;
    const position = headerPositionLabel(s);
    const refreshBusy = refreshBusyOverride || h.refreshLoading || (h.loadWorkflowActive && !h.ssoInProgress);
    const refreshDisabled = refreshBusy || h.logoutLoading;

    return (
      <View style={{paddingLeft: 8, paddingTop: 4, paddingRight: 4}}>
        <View style={{height: 48, alignItems: 'center', justifyContent: 'center'}}>
          {position != null ? <View style={{paddingHorizontal: 96, alignSelf: 'stretch'}}>{buildHeaderPositionText(position)}</View> : null}
          <View style={{position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center'}}>
            <IconButton
              disabled={refreshDisabled}
              onPress={async () => {
                if (onRefreshOverride != null) {
                  s.clearAuthError();
                  if (mounted()) {
                    setState(() => {
                      h.fatcaTaxResidencyMustPickNo = false;
                    });
                  }
                  onRefreshOverride();
                  return;
                }
                await refreshWorkflowFromHeader(s);
              }}>
              {refreshBusy ? (
                <Spinner size={24} strokeWidth={2} color={KycTheme.primary} />
              ) : (
                <MaterialIcon name="refresh" size={24} color={KycTheme.textPrimary} />
              )}
            </IconButton>
            <IconButton disabled={h.logoutLoading} onPress={() => void handleLogout()}>
              {h.logoutLoading ? (
                <Spinner size={24} strokeWidth={2} color={KycTheme.primary} />
              ) : (
                <MaterialIcon name="logout" size={24} color={KycTheme.textPrimary} />
              )}
            </IconButton>
          </View>
        </View>
      </View>
    );
  }

  /**
   * `centerVertically`: Flutter `Center` inside an `Expanded` fills the space; inside a scroll view
   * (KycLayout) it shrink-wraps, so the content stays at the top.
   */
  function buildApiErrorRetryContent(
    s: AppStore,
    opts: {message: string; onRetry?: (() => void) | null; centerVertically?: boolean},
  ): React.ReactElement {
    const retryDisabled = h.refreshLoading || h.loadWorkflowActive;
    return (
      <View style={opts.centerVertically ? {flex: 1, alignItems: 'center', justifyContent: 'center'} : {alignItems: 'center'}}>
        <View style={{paddingHorizontal: 32, alignItems: 'center'}}>
          <MaterialIcon name="cloud_off_rounded" size={64} color={ORANGE_400} />
          <View style={{height: 16}} />
          <Text style={{textAlign: 'center', fontSize: 15, fontWeight: '500', color: GREY_700, lineHeight: 22.5}}>
            {opts.message}
          </Text>
          <View style={{height: 24}} />
          <ElevatedButton
            paddingHorizontal={32}
            paddingVertical={14}
            borderRadius={10}
            onPress={
              retryDisabled
                ? null
                : () => {
                    s.clearAuthError();
                    setState(() => {
                      h.webViewReturnError = null;
                    });
                    if (opts.onRetry != null) {
                      opts.onRetry();
                    } else {
                      void loadWorkflow();
                    }
                  }
            }>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <MaterialIcon name="refresh_rounded" size={18} color={retryDisabled ? 'rgba(29,27,32,0.38)' : '#FFFFFF'} />
              <View style={{width: 8}} />
              <Text style={{fontSize: 15, fontWeight: '600', color: retryDisabled ? 'rgba(29,27,32,0.38)' : '#FFFFFF'}}>
                Try Again
              </Text>
            </View>
          </ElevatedButton>
        </View>
      </View>
    );
  }

  function buildApiErrorScaffold(opts: {
    store: AppStore;
    message: string;
    isAuthenticated: boolean;
    onRetry?: (() => void) | null;
  }): React.ReactElement {
    const friendly = friendlyApiErrorMessage(opts.message);
    return (
      <View style={{flex: 1, backgroundColor: KycTheme.background}}>
        <SafeAreaView style={{flex: 1}}>
          <View style={{flex: 1, alignItems: 'stretch'}}>
            {opts.isAuthenticated ? buildAuthenticatedHeaderActions(opts.store) : null}
            <View style={{flex: 1}}>
              <KycLayout
                title="Unable to load"
                stepperSteps={null}
                stepperIndex={null}
                skipScaffold
                showDocumentsSection={false}>
                {buildApiErrorRetryContent(opts.store, {message: friendly, onRetry: opts.onRetry})}
              </KycLayout>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  function buildWebViewReturnRetryContent(s: AppStore): React.ReactElement {
    return buildApiErrorRetryContent(s, {
      centerVertically: true,
      message: friendlyApiErrorMessage(h.webViewReturnError),
      onRetry: () => {
        setState(() => {
          h.returnFlowMessage = 'Loading your next step...';
        });
        void loadWorkflow();
      },
    });
  }

  // ----------------------------------------------------------


  // --- BP Wealth bugfixes (BugFixes → segmentBugResolved) ---
  // Personal-details step: merge get-context `field.value` (dropoff) into formData,
  // normalize radio/select option strings, apply PEP/citizen/tax/tariff defaults.
  // Segments step: `prepareFormData` forces mtf / NSE-BSE currency off when UI hides them.
  // ---------------------------------------------------------------------------

  /** Matches workflow option labels (radio or **select** dropdown). Exact match first, then Yes/No prefix. */
  function matchRadioOption(values: any[] | null | undefined, desired: string): string | null {
    if (values == null || values.length === 0) return null;
    const want = desired.toLowerCase().trim();
    for (const o of values) {
      const s = toStr(o);
      if (s.toLowerCase().trim() === want) return s;
    }
    if (want === 'yes') {
      for (const o of values) {
        const sl = toStr(o).toLowerCase().trim();
        if (sl.startsWith('y')) return toStr(o);
      }
    }
    if (want === 'no') {
      for (const o of values) {
        const sl = toStr(o).toLowerCase().trim();
        if (sl.startsWith('n')) return toStr(o);
      }
    }
    return null;
  }

  /** Map API/dropoff value to the exact option string (radio or **select**). */
  function normalizeRadioToOptions(raw: any, options: any[] | null | undefined): string {
    if (raw == null || options == null || options.length === 0) {
      return raw != null ? toStr(raw) : '';
    }
    const want = toStr(raw).trim().toLowerCase();
    for (const o of options) {
      const s = toStr(o);
      if (s.toLowerCase().trim() === want) return s;
    }
    if (want === 'yes' || want === 'y') {
      const m = matchRadioOption(options, 'Yes');
      if (m != null) return m;
    }
    if (want === 'no' || want === 'n') {
      const m = matchRadioOption(options, 'No');
      if (m != null) return m;
    }
    if (want.startsWith('y')) {
      const m = matchRadioOption(options, 'Yes');
      if (m != null) return m;
    }
    if (want.startsWith('n')) {
      const m = matchRadioOption(options, 'No');
      if (m != null) return m;
    }
    return toStr(raw);
  }

  function findAadharImageFieldDef(fieldList: any[]): AnyMap | null {
    for (const f of fieldList) {
      if (!isMap(f)) continue;
      if (CF.isAadharImageFieldName(toStrOrNull(f.name))) return f;
    }
    return null;
  }

  function applyDigilockerAadharImageToForm(s: AppStore, fieldList: any[]): void {
    const aadharField = findAadharImageFieldDef(fieldList);
    if (aadharField == null) return;
    const name = toStrOrNull(aadharField.name);
    if (name == null || name.length === 0) return;

    const resolved = CF.resolveDigilockerAadharImageRaw({
      userDetails: s.userDetails,
      fieldValue: aadharField.value,
      formValue: formNotifier.formData[name],
    });
    if (resolved == null) return;
    const cur = formNotifier.formData[name];
    const current = cur != null ? toStr(cur).trim() : '';
    if (resolved.trim() === current) return;

    debugPrint(`[HomePage] DigiLocker aadhar_image sync: ${current} → ${resolved.trim()}`);
    formNotifier.handleChange(name, resolved, {
      type: toStrOrNull(aadharField.type) ?? 'text',
      validationType: toStrOrNull(aadharField.validation),
    });
  }

  function syncDigilockerAadharImage(
    s: AppStore,
    fieldList: any[],
    opts: {position?: string | null; pageLabel?: string | null} = {},
  ): void {
    if (!CF.isDigilockerStep(opts.position, opts.pageLabel)) return;

    applyDigilockerAadharImageToForm(s, fieldList);

    if (h.digilockerUserDetailsFetchStarted) return;
    h.digilockerUserDetailsFetchStarted = true;
    void s.fetchUserDetails().then(() => {
      if (!mounted()) return;
      applyDigilockerAadharImageToForm(s, fieldList);
      rerender();
    });
  }

  function syncPanVerifyFieldsToForm(normalized: AnyMap): void {
    for (const [key, value] of Object.entries(normalized)) {
      const cur = formNotifier.formData[key];
      const current = cur != null ? toStr(cur) : '';
      const next = value != null ? toStr(value) : '';
      if (current === next) continue;
      formNotifier.handleChange(key, value, {type: 'text'});
    }
  }

  /**
   * Prefer in-memory value; if unset (`null` / blank), use workflow seed
   * (`value` → literal prepopulate → `defaultValue`).
   */
  function coalesceFormFieldValue(formValue: any, fieldValue: any, opts: {type?: string | null} = {}): any {
    const fieldType = (opts.type ?? '').toLowerCase();
    if (
      typeof formValue === 'boolean' &&
      (fieldType === 'text' || fieldType === 'textarea' || fieldType === 'number' || fieldType === 'password')
    ) {
      formValue = '';
    }
    // Never show prepopulate source mappings / key names in inputs.
    if (Array.isArray(formValue) || isMap(formValue)) {
      formValue = null;
    } else if (
      typeof formValue === 'string' &&
      CF.looksLikePrepopulateSourceKey(formValue) &&
      !CF.isKycChoiceFieldType(fieldType) &&
      fieldType !== 'checkbox'
    ) {
      formValue = null;
    }
    if (Array.isArray(fieldValue) || isMap(fieldValue)) {
      fieldValue = null;
    } else if (
      typeof fieldValue === 'string' &&
      CF.looksLikePrepopulateSourceKey(fieldValue) &&
      !CF.isKycChoiceFieldType(fieldType) &&
      fieldType !== 'checkbox'
    ) {
      fieldValue = null;
    }
    if (formValue == null) return fieldValue;
    const isChoiceOrCheckbox = CF.isKycChoiceFieldType(fieldType) || fieldType === 'checkbox';
    if (
      typeof formValue === 'string' &&
      (formValue.trim().length === 0 || CF.isApiFieldPlaceholderValue(formValue))
    ) {
      return isChoiceOrCheckbox ? fieldValue : formValue;
    }
    return formValue;
  }

  /**
   * True when [formData] has no meaningful value yet (merge dropoff/API into form).
   * Blank string means the user cleared the field — do not merge API prepopulate again.
   */
  function shouldMergeFromApi(existing: any): boolean {
    if (existing == null) return true;
    if (typeof existing === 'string' && existing.trim().length === 0) return false;
    return false;
  }

  /** Personal-details defaults (PEP, tax residency): apply when null or still empty. */
  function shouldApplyPersonalDetailsDefault(existing: any): boolean {
    if (existing == null) return true;
    if (typeof existing === 'string' && existing.trim().length === 0) return true;
    return false;
  }

  /**
   * Push seed from get-context (`value` → literal prepopulate → `defaultValue`) into [formData]
   * so radios/checkboxes match option strings. Skips source-key mappings (reverse_*).
   */
  function mergePersonalDetailsFromFieldDefinitions(fieldList: any[]): void {
    for (const f of fieldList) {
      if (!isMap(f)) continue;
      const name = toStrOrNull(f.name);
      if (name == null || name.length === 0) continue;
      const existing = formNotifier.formData[name];
      if (!shouldMergeFromApi(existing)) continue;

      const apiValue = CF.resolveApiFieldSeedValue(f);
      if (apiValue == null) continue;
      if (typeof apiValue === 'string' && apiValue.trim().length === 0) continue;

      const type = toStrOrNull(f.type) ?? '';
      const validation = toStrOrNull(f.validation);
      const values = f.values as any[] | null | undefined;

      if (CF.isKycChoiceFieldType(type)) {
        const normalized = normalizeRadioToOptions(apiValue, values);
        formNotifier.handleChange(name, normalized, {type, validationType: validation});
      } else if (type === 'checkbox') {
        const v = CF.isCheckboxCheckedValue(apiValue);
        formNotifier.handleChange(name, v, {type: 'checkbox', validationType: validation});
      } else {
        formNotifier.handleChange(name, apiValue, {type: type.length === 0 ? 'text' : type, validationType: validation});
      }
    }
  }

  /** Fix casing mismatch for radio and **select** (dropdown) option lists. */
  function normalizePersonalDetailRadios(fieldList: any[]): void {
    for (const f of fieldList) {
      if (!isMap(f)) continue;
      const type = toStrOrNull(f.type) ?? '';
      if (type !== 'radio' && type !== 'select') continue;
      const name = toStrOrNull(f.name);
      if (name == null || name.length === 0) continue;
      const values = f.values as any[] | null | undefined;
      const raw = formNotifier.formData[name];
      if (raw == null) continue;
      const fixed = normalizeRadioToOptions(raw, values);
      if (fixed !== toStr(raw)) {
        formNotifier.handleChange(name, fixed, {type, validationType: toStrOrNull(f.validation)});
      }
    }
  }

  function isBpWealthCompany(): boolean {
    return widget.company.toLowerCase().trim() === 'bpwealth';
  }

  /** BP Wealth only: merge dropoff, normalize radios, then PEP/citizen/tax/tariff defaults. */
  function runPersonalDetailsBpWealthPipeline(s: AppStore, fieldList: any[]): void {
    if (!isBpWealthCompany()) return;
    const ctx = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
    let position = toStrOrNull(ctx?.position)?.toLowerCase() ?? '';
    let pageLabel = toStrOrNull(ctx?.page?.data?.label)?.toLowerCase() ?? '';
    if (position.length === 0 || pageLabel.length === 0) {
      const workflow = isMap(s.fields) ? s.fields : null;
      position = (toStrOrNull(workflow?.position) ?? '').toLowerCase();
      pageLabel = (toStrOrNull(workflow?.data?.label) ?? '').toLowerCase();
    }
    const isPersonalDetails = position === 'personal_details' || pageLabel === 'personal_details';
    if (!isPersonalDetails) return;

    debugPrint(`[HomePage] personal_details BP Wealth pipeline: fields=${fieldList.length}`);
    mergePersonalDetailsFromFieldDefinitions(fieldList);
    normalizePersonalDetailRadios(fieldList); // radio + select (dropdowns)
    applyPersonalDetailsDefaults(fieldList);
    applyBpWealthStandingInstructionScreenshotDefaults(fieldList);
  }

  /** Web standing-instructions accordion defaults (screenshot parity) when value still unset. */
  function applyBpWealthStandingInstructionScreenshotDefaults(fieldList: any[]): void {
    if (!isBpWealthCompany()) return;

    const pickElectronic = (values: any[] | null | undefined): string | null => {
      if (values == null) return null;
      for (const o of values) {
        const s = toStr(o);
        if (s.toLowerCase().includes('elect')) return s;
      }
      return null;
    };

    const pickSebiRegulations = (values: any[] | null | undefined): string | null => {
      if (values == null) return null;
      for (const o of values) {
        const s = toStr(o);
        const sl = s.toLowerCase();
        if (sl.includes('sebi') && sl.includes('regul')) return s;
        if (sl.includes('as per')) return s;
      }
      return null;
    };

    const applyYesNo = (fieldName: string, yesOrNo: string): void => {
      for (const f of fieldList) {
        if (!isMap(f)) continue;
        if (toStrOrNull(f.name) !== fieldName) continue;
        const type = toStrOrNull(f.type) ?? '';
        if (type !== 'radio' && type !== 'select') return;
        if (!shouldMergeFromApi(formNotifier.formData[fieldName])) return;
        const values = f.values as any[] | null | undefined;
        const pick = matchRadioOption(values, yesOrNo);
        if (pick != null) {
          formNotifier.handleChange(fieldName, pick, {type, validationType: toStrOrNull(f.validation)});
        }
        return;
      }
    };

    const applyElectronic = (fieldName: string): void => {
      for (const f of fieldList) {
        if (!isMap(f)) continue;
        if (toStrOrNull(f.name) !== fieldName) continue;
        const type = toStrOrNull(f.type) ?? '';
        if (type !== 'radio' && type !== 'select') return;
        if (!shouldMergeFromApi(formNotifier.formData[fieldName])) return;
        const values = f.values as any[] | null | undefined;
        const raw = pickElectronic(values);
        if (raw == null) return;
        const normalized = normalizeRadioToOptions(raw, values);
        formNotifier.handleChange(fieldName, normalized, {type, validationType: toStrOrNull(f.validation)});
        return;
      }
    };

    const pickQuarterly = (values: any[] | null | undefined): string | null => {
      if (values == null) return null;
      for (const o of values) {
        const s = toStr(o);
        if (s.toLowerCase().includes('quarter')) return s;
      }
      return matchRadioOption(values, 'Quarterly');
    };

    const applyStatementFrequencyByDisplayName = (): void => {
      for (const f of fieldList) {
        if (!isMap(f)) continue;
        const name = toStrOrNull(f.name);
        if (name == null) continue;
        if (!CF.bpWealthPersonalDetailsHoldingStatementFrequencyField(f)) continue;
        const type = toStrOrNull(f.type) ?? '';
        if (type !== 'radio' && type !== 'select') continue;
        if (!shouldMergeFromApi(formNotifier.formData[name])) continue;
        const values = f.values as any[] | null | undefined;
        const raw = pickSebiRegulations(values);
        if (raw == null) continue;
        const normalized = normalizeRadioToOptions(raw, values);
        formNotifier.handleChange(name, normalized, {type, validationType: toStrOrNull(f.validation)});
      }
    };

    const applyDisBookletFrequencyDefault = (): void => {
      for (const f of fieldList) {
        if (!isMap(f)) continue;
        if (!CF.bpWealthPersonalDetailsDisBookletFrequencyField(f)) continue;
        const name = toStrOrNull(f.name);
        if (name == null || name.length === 0) continue;
        const type = toStrOrNull(f.type) ?? '';
        if (type !== 'radio' && type !== 'select') continue;
        if (!shouldMergeFromApi(formNotifier.formData[name])) continue;
        const values = f.values as any[] | null | undefined;
        const raw = pickQuarterly(values);
        if (raw == null) continue;
        const normalized = normalizeRadioToOptions(raw, values);
        formNotifier.handleChange(name, normalized, {type, validationType: toStrOrNull(f.validation)});
      }
    };

    const applyRunningAccountAuthorizationDefault = (): void => {
      for (const f of fieldList) {
        if (!isMap(f)) continue;
        if (!CF.bpWealthPersonalDetailsRunningAccountAuthorizationField(f)) {
          continue;
        }
        const name = toStrOrNull(f.name);
        if (name == null || name.length === 0) continue;
        const type = toStrOrNull(f.type) ?? '';
        if (type !== 'radio' && type !== 'select') continue;
        if (!shouldMergeFromApi(formNotifier.formData[name])) continue;
        const values = f.values as any[] | null | undefined;
        const raw = pickQuarterly(values);
        if (raw == null) continue;
        const normalized = normalizeRadioToOptions(raw, values);
        formNotifier.handleChange(name, normalized, {type, validationType: toStrOrNull(f.validation)});
      }
    };

    applyYesNo('sebi_3years', 'No');
    applyYesNo('directly_bank_account', 'Yes');
    applyYesNo('credit_account', 'Yes');
    applyYesNo('rta', 'Yes');
    applyYesNo('dp_accept', 'No');
    applyYesNo('electronic_transaction', 'Yes');
    applyElectronic('receive_contract');
    applyElectronic('annual_report');
    applyStatementFrequencyByDisplayName();
    applyYesNo('debitbalance', 'Yes');
    applyYesNo('dis_booklet', 'No');
    applyYesNo('dis_book', 'No');
    applyYesNo('dis', 'No');
    applyYesNo('delivery_instruction_slip', 'No');
    applyYesNo('dis_slip', 'No');
    applyDisBookletFrequencyDefault();
    applyRunningAccountAuthorizationDefault();
    applyBpWealthPersonalDetailsPepAndTaxDefaults(fieldList);
  }

  function applyBpWealthPersonalDetailsPepAndTaxDefaults(fieldList: any[]): void {
    for (const f of fieldList) {
      if (!isMap(f)) continue;
      const map: AnyMap = {...f};
      const name = toStrOrNull(map.name);
      if (name == null || name.length === 0) continue;
      const isPep = CF.bpWealthPersonalDetailsPoliticallyExposedField(map);
      const isTax = CF.isTaxResidencyOutsideIndiaField(map);
      if (!isPep && !isTax) continue;

      const type = toStrOrNull(map.type) ?? '';
      if (type !== 'radio' && type !== 'select') continue;
      if (!shouldApplyPersonalDetailsDefault(formNotifier.formData[name])) {
        continue;
      }

      const values = map.values as any[] | null | undefined;
      const pick = matchRadioOption(values, 'No');
      if (pick == null) continue;
      formNotifier.handleChange(name, pick, {type, validationType: toStrOrNull(map.validation)});
    }
  }

  /** Personal details step: defaults when API/dropoff did not pre-fill. */
  function applyPersonalDetailsDefaults(fieldList: any[]): void {
    for (const f of fieldList) {
      if (!isMap(f)) continue;
      const name = toStrOrNull(f.name);
      if (name == null || name.length === 0) continue;
      if (!shouldApplyPersonalDetailsDefault(formNotifier.formData[name])) {
        continue;
      }

      const map: AnyMap = {...f};
      const dn = (f.displayName != null ? toStr(f.displayName) : '').toLowerCase();
      const nl = name.toLowerCase();
      const type = toStrOrNull(f.type) ?? '';
      const values = f.values as any[] | null | undefined;
      const validation = toStrOrNull(f.validation);

      if (type === 'radio' || type === 'select') {
        const vYes = matchRadioOption(values, 'Yes');
        const vNo = matchRadioOption(values, 'No');

        if (CF.bpWealthPersonalDetailsPoliticallyExposedField(map) && vNo != null) {
          formNotifier.handleChange(name, vNo, {type, validationType: validation});
          continue;
        }

        const citizenIndia =
          (dn.includes('citizen') && dn.includes('india')) || (nl.includes('citizen') && (nl.includes('india') || nl.includes('indian')));
        if (citizenIndia && vYes != null) {
          formNotifier.handleChange(name, vYes, {type, validationType: validation});
          continue;
        }

        if (CF.isTaxResidencyOutsideIndiaField(map) && vNo != null) {
          formNotifier.handleChange(name, vNo, {type, validationType: validation});
          continue;
        }

        // Tariff / "continue your journey" style dropdown — pick default/tariff option if any.
        const journeyTariff =
          dn.includes('tariff') ||
          nl.includes('tariff') ||
          (dn.includes('journey') && dn.includes('continue')) ||
          (dn.includes('please select') && dn.includes('continue')) ||
          (dn.includes('option') && dn.includes('continue'));
        if (journeyTariff && values != null && values.length > 0) {
          let pick: string | null = null;
          for (const o of values) {
            const s = toStr(o);
            const sl = s.toLowerCase();
            if (sl.includes('default') || sl.includes('tariff') || sl.includes('brokerage') || sl.includes('stoxbox')) {
              pick = s;
              break;
            }
          }
          pick ??= toStr(values[0]);
          formNotifier.handleChange(name, pick, {type, validationType: validation});
          continue;
        }
        continue;
      }

      if (type === 'checkbox') {
        const tariff = dn.includes('tariff') || nl.includes('tariff');
        if (tariff) {
          formNotifier.handleChange(name, true, {type: 'checkbox', validationType: validation});
        }
      }
    }
  }

  /**
   * Dart VM `String.hashCode` (Jenkins one-at-a-time over UTF-16 code units, 30-bit result).
   * Only used to reproduce the pseudo-random-but-stable order of unlisted BP Wealth fields.
   */
  function dartStringHashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash + str.charCodeAt(i)) >>> 0;
      hash = (hash + ((hash << 10) >>> 0)) >>> 0;
      hash = (hash ^ (hash >>> 6)) >>> 0;
    }
    hash = (hash + ((hash << 3) >>> 0)) >>> 0;
    hash = (hash ^ (hash >>> 11)) >>> 0;
    hash = (hash + ((hash << 15) >>> 0)) >>> 0;
    hash = hash & ((1 << 30) - 1);
    return hash === 0 ? 1 : hash;
  }

  const bpWealthPersonalMainOrder = [
    'fathers_name',
    'father_name',
    'father',
    'fathername',
    'mothers_name',
    'mother_name',
    'mother',
    'mothername',
    'gender',
    'marital_status',
    'maritalstatus',
    'spouse_name',
    'spouse',
    'education',
    'annual_income',
    'income',
    'gross_annual_income',
    'annualincome',
    'trading_experience',
    'tradingexperience',
    'politically_exposed',
    'pep',
    'political_exposed',
    'occupation',
    'citizen_of_india',
    'citizen',
    'indian_citizen',
    'citizenindia',
    'ddpi',
    'execute_ddpi',
    'demat_debit_pledge',
    'tax_residency',
    'tax_residency_outside_india',
    'taxresidency',
    'penny_drop_condition',
  ];

  function bpWealthPersonalMainSortKey(name: string | null | undefined): number {
    if (name == null) return 99999;
    const n = name.toLowerCase();
    const i = bpWealthPersonalMainOrder.indexOf(n);
    if (i >= 0) return i;
    return 9000 + (dartStringHashCode(n) % 10000);
  }

  const bpWealthStandingOrder = [
    'sebi_3years',
    'past_action',
    'past_actions',
    'directly_bank_account',
    'credit_account',
    'rta',
    'dp_accept',
    'electronic_transaction',
    'receive_contract',
    'annual_report',
    'holding_cum_transaction_statement',
    'holding_transaction_statement',
    'transaction_statement_frequency',
    'cum_holding_statement',
    'debitbalance',
    'running_account_authorization',
    'running_account',
    'running_ac_authorization',
    'raa',
    'dis_booklet',
    'dis_book',
    'dis',
    'delivery_instruction_slip',
    'dis_slip',
  ];

  function bpWealthStandingSortKey(f: AnyMap): number {
    if (CF.bpWealthPersonalDetailsPastActionField(f)) {
      return 1;
    }
    if (CF.bpWealthPersonalDetailsHoldingStatementFrequencyField(f)) {
      return 8;
    }
    if (CF.bpWealthPersonalDetailsDisBookletFrequencyField(f)) {
      return 14;
    }
    if (CF.bpWealthPersonalDetailsRunningAccountAuthorizationField(f)) {
      return 13;
    }
    const name = toStrOrNull(f.name);
    if (name == null) return 99999;
    const i = bpWealthStandingOrder.indexOf(name);
    if (i >= 0) return i;
    return 8000 + (dartStringHashCode(name) % 1000);
  }

  /**
   * Opens the bundled tariff PDF.
   * iOS: in-app WebView preview dialog.
   * Android: system viewer.
   */
  async function openBpWealthTariffPdf(): Promise<void> {
    if (h.bpWealthTariffPdfOpening) return;
    h.bpWealthTariffPdfOpening = true;
    try {
      if (Platform.OS === 'ios') {
        if (!mounted()) return;
        h.tariffPdfPreviewVisible = true;
        rerender();
        return;
      }

      const dest = `${CachesDirectoryPath}/bpwealth_tariff_plan_${Date.now()}.pdf`;
      await copyFileAssets(BP_WEALTH_TARIFF_PDF_ANDROID_ASSET, dest);
      await viewDocument({uri: `file://${dest}`, mimeType: 'application/pdf'});
      debugPrint(`[HomePage] Tariff PDF open: done path=${dest}`);
    } catch (e: any) {
      debugPrint(`[HomePage] Tariff PDF open failed: ${e}`);
      const msg = toStr(e?.message ?? e);
      if (/No Activity found|ActivityNotFound|no app/i.test(msg)) {
        Fluttertoast.showToast({
          msg: 'Unable to open PDF. Please install a PDF viewer and try again.',
          gravity: 'TOP',
          long: true,
        });
      } else {
        Fluttertoast.showToast({
          msg: 'Unable to open PDF. Please try again later.',
          gravity: 'TOP',
        });
      }
    } finally {
      h.bpWealthTariffPdfOpening = false;
    }
  }


  /**
   * BP Wealth personal_details: web-like header, single-column main (2nd screenshot fields only),
   * Standing accordion, then tariff consent + View (PDF) **below** accordion.
   */
  function buildBpWealthPersonalWebFormLayout(opts: {
    visibleFieldsForDisplay: any[];
    otpField: AnyMap | null;
    otpFieldName: string | null;
    hasAadharImage: boolean;
    activeFields: any;
    store: AppStore;
    fieldList: any[];
    position: string | null;
    pageLabel: string | null;
    ctx: AnyMap | null;
  }): React.ReactNode[] {
    const {fieldList} = opts;
    const maps: AnyMap[] = opts.visibleFieldsForDisplay.filter(e => isMap(e)).map(e => ({...e}));

    const main: AnyMap[] = [];
    const standing: AnyMap[] = [];
    let consentField: AnyMap | null = null;

    for (const f of maps) {
      if (CF.bpWealthPersonalDetailsTariffConsentCheckboxField(f)) {
        consentField = f;
        continue;
      }
      // Must use [bpWealthPersonalDetailsStandingSectionField] — not only
      // [kBpWealthPersonalDetailsStandingFieldNames], so displayName-based
      // rows (e.g. holding cum transaction statement frequency) land here.
      if (CF.bpWealthPersonalDetailsStandingSectionField(f)) {
        standing.push(f);
      } else {
        // Main grid: whitelisted fields + conditionally revealed rows (e.g. spouse_name).
        main.push(f);
      }
    }

    if (consentField == null) {
      for (const raw of fieldList) {
        if (!isMap(raw)) continue;
        const f: AnyMap = {...raw};
        if (CF.bpWealthPersonalDetailsTariffConsentCheckboxField(f)) {
          consentField = f;
          break;
        }
      }
    }

    main.sort((a, b) => bpWealthPersonalMainSortKey(toStrOrNull(a.name)) - bpWealthPersonalMainSortKey(toStrOrNull(b.name)));
    standing.sort((a, b) => bpWealthStandingSortKey(a) - bpWealthStandingSortKey(b));

    const rowArgs = {
      otpField: opts.otpField,
      otpFieldName: opts.otpFieldName,
      hasAadharImage: opts.hasAadharImage,
      activeFields: opts.activeFields,
      store: opts.store,
      fieldList,
      position: opts.position,
      pageLabel: opts.pageLabel,
      ctx: opts.ctx,
    };

    const out: React.ReactNode[] = [
      <View key="bpw-top-gap" style={{height: 8}} />,
      ...main.map((f, i) => (
        <View key={`bpw-main-${toStr(f.name)}-${i}`} style={{paddingBottom: 16}}>
          {buildFormFieldRow({field: f, ...rowArgs})}
        </View>
      )),
    ];

    if (standing.length > 0) {
      out.push(<View key="bpw-standing-gap" style={{height: 8}} />);
      out.push(
        <View key="bpw-standing" style={{paddingBottom: 16}}>
          <ExpansionTile
            key="bpwealth_standing_instructions"
            initiallyExpanded={false}
            tilePaddingHorizontal={12}
            tilePaddingVertical={4}
            borderRadius={KycTheme.radiusSm}
            borderColor={KycTheme.border}
            title="Standing instructions"
            titleStyle={{fontSize: KycTheme.fontSizeBodyLg, fontWeight: '600', color: KycTheme.textPrimary}}
            subtitle="DP preferences & statement options"
            subtitleStyle={{fontSize: KycTheme.fontSizeCaption, color: KycTheme.textSecondary}}>
            <View style={{paddingLeft: 12, paddingRight: 12, paddingBottom: 12, alignItems: 'stretch'}}>
              {standing.map(g => (
                <React.Fragment key={`bp-standing-${toStrOrNull(g.name) ?? ''}`}>
                  {buildFormFieldRow({field: g, ...rowArgs})}
                </React.Fragment>
              ))}
            </View>
          </ExpansionTile>
        </View>,
      );
    }

    if (consentField != null) {
      out.push(<View key="bpw-consent-gap" style={{height: 8}} />);
      out.push(
        <React.Fragment key="bpw-consent">{buildFormFieldRow({field: consentField, ...rowArgs})}</React.Fragment>,
      );
    } else {
      out.push(<View key="bpw-consent-gap" style={{height: 8}} />);
      out.push(
        <Text
          key="bpw-consent-text"
          style={{fontSize: KycTheme.fontSizeBody, color: KycTheme.textPrimary, lineHeight: KycTheme.fontSizeBody * 1.35}}>
          I have read and understood the contents pertaining to the DP Standing Instructions and Tariff Structure details. I hereby
          agree and give my consent to the same.
        </Text>,
      );
    }

    out.push(<View key="bpw-view-gap" style={{height: 12}} />);
    out.push(
      <View key="bpw-view-btn" style={{alignItems: 'flex-start'}}>
        <ElevatedButton
          borderRadius={20}
          paddingHorizontal={24}
          paddingVertical={12}
          labelStyle={{fontSize: 14, fontWeight: '500'}}
          label="View"
          onPress={() => void openBpWealthTariffPdf()}
        />
      </View>,
    );

    return out;
  }

  /** Default: sequential rows + BP Wealth standing expansion (non–personal_details). */
  function buildSequencedFormRowsWithStandingExpansion(opts: {
    visibleFieldsForDisplay: any[];
    otpField: AnyMap | null;
    otpFieldName: string | null;
    hasAadharImage: boolean;
    activeFields: any;
    store: AppStore;
    fieldList: any[];
    position: string | null;
    pageLabel: string | null;
    ctx: AnyMap | null;
  }): React.ReactNode[] {
    const {visibleFieldsForDisplay, position, pageLabel} = opts;
    const rowArgs = {
      otpField: opts.otpField,
      otpFieldName: opts.otpFieldName,
      hasAadharImage: opts.hasAadharImage,
      activeFields: opts.activeFields,
      store: opts.store,
      fieldList: opts.fieldList,
      position,
      pageLabel,
      ctx: opts.ctx,
    };
    const rows: React.ReactNode[] = [];
    let idx = 0;
    while (idx < visibleFieldsForDisplay.length) {
      const raw = visibleFieldsForDisplay[idx];
      if (!isMap(raw)) {
        idx++;
        continue;
      }
      const fieldMap: AnyMap = {...raw};
      if (bpWealthPersonalDetailsStandingUi(position, pageLabel) && CF.bpWealthPersonalDetailsStandingSectionField(fieldMap)) {
        const group: AnyMap[] = [];
        while (idx < visibleFieldsForDisplay.length) {
          const r2 = visibleFieldsForDisplay[idx];
          if (!isMap(r2)) break;
          const m2: AnyMap = {...r2};
          if (!bpWealthPersonalDetailsStandingUi(position, pageLabel) || !CF.bpWealthPersonalDetailsStandingSectionField(m2)) {
            break;
          }
          group.push(m2);
          idx++;
        }
        rows.push(
          <View key={`bpw-seq-standing-${idx}`} style={{paddingBottom: 16}}>
            <ExpansionTile
              key="bpwealth_standing_instructions"
              initiallyExpanded={false}
              tilePaddingHorizontal={12}
              tilePaddingVertical={4}
              borderRadius={KycTheme.radiusSm}
              borderColor={KycTheme.border}
              title="Standing instructions & declarations"
              titleStyle={{fontSize: KycTheme.fontSizeBodyLg, fontWeight: '600', color: KycTheme.textPrimary}}
              subtitle="Tap to expand (same as website)"
              subtitleStyle={{fontSize: KycTheme.fontSizeCaption, color: KycTheme.textSecondary}}>
              <View style={{paddingLeft: 12, paddingRight: 12, paddingBottom: 12, alignItems: 'stretch'}}>
                {group.map(g => (
                  <React.Fragment key={`bp-standing-${toStrOrNull(g.name) ?? ''}`}>
                    {buildFormFieldRow({field: g, ...rowArgs})}
                  </React.Fragment>
                ))}
              </View>
            </ExpansionTile>
          </View>,
        );
        continue;
      }
      rows.push(
        <React.Fragment key={`seq-row-${toStrOrNull(fieldMap.name) ?? ''}-${idx}`}>
          {buildFormFieldRow({field: fieldMap, ...rowArgs})}
        </React.Fragment>,
      );
      idx++;
    }
    return rows;
  }


  function buildForm(
    fieldList: any[],
    activeFields: any,
    submitButton: AnyMap | null | undefined,
    s: AppStore,
    isAuth: boolean,
  ): React.ReactElement {
    // Check if this is segments screen / mobile screen
    const withAuth = isMap(s.fieldsWithAuth) ? s.fieldsWithAuth : null;
    const ctx: AnyMap | null = contextForUi(s) ?? (isMap(withAuth?.context) ? withAuth!.context : null);

    let position: string | null = toStrOrNull(ctx?.position)?.toLowerCase() ?? null;
    let pageLabel: string | null = toStrOrNull(ctx?.page?.data?.label)?.toLowerCase() ?? null;

    // Fallback for unauthenticated flow where context may be null:
    // use workflow root from store.fields (get-workflow-details response)
    if (position == null || position.length === 0 || pageLabel == null || pageLabel.length === 0) {
      if (isMidAuthenticatedJourney(s) && (h.cachedPosition ?? '').length > 0) {
        position = h.cachedPosition!.toLowerCase();
      } else {
        const workflow = isMap(s.fields) ? s.fields : null;
        position = (toStrOrNull(workflow?.position) ?? position ?? '').toLowerCase();
        pageLabel = (toStrOrNull(workflow?.data?.label) ?? pageLabel ?? '').toLowerCase();
      }
    }

    debugPrint(`[HomePage] _buildForm position=${position} pageLabel=${pageLabel}`);

    // Mobile T&C: auto-tick once when this step is shown.
    if (position === 'mobile' || pageLabel === 'mobile') {
      const pageId = toStrOrNull(ctx?.page?.id) ?? '';
      const termsKey = `mobile|${pageId}`;
      if (h.mobileTermsAutoSelectedStepKey !== termsKey) {
        h.mobileTermsAutoSelectedStepKey = termsKey;
        h.termsAccepted = true;
        h.showTermsError = false;
        postFrame.push(() => {
          if (!mounted()) return;
          if (h.mobileTermsAutoSelectedStepKey !== termsKey) return;
          setState(() => {
            h.termsAccepted = true;
            h.showTermsError = false;
          });
        });
      }
    } else if (h.mobileTermsAutoSelectedStepKey != null) {
      h.mobileTermsAutoSelectedStepKey = null;
    }

    const isNomineeStepForDefaults = FV.isNomineeKycStep(position, pageLabel);
    const isNomineePercentageStep = FV.isNomineePercentageKycStep(position, pageLabel);

    if (isNomineePercentageStep) {
      const pageId = toStrOrNull(ctx?.page?.id) ?? '';
      const stepKey = `${position ?? ''}|${pageId}`;
      if (stepKey !== h.nomineePercentageDefaultsStepKey) {
        h.nomineePercentageDefaultsStepKey = stepKey;
        postFrame.push(() => {
          if (!mounted()) return;
          if (h.nomineePercentageDefaultsStepKey !== stepKey) return;
          ensureNomineePercentageStepAuto100(fieldList);
        });
      }
    } else if (h.nomineePercentageDefaultsStepKey != null) {
      h.nomineePercentageDefaultsStepKey = null;
    }

    if (isNomineeStepForDefaults) {
      const pageId = toStrOrNull(ctx?.page?.id) ?? '';
      const stepKey = `${position ?? ''}|${pageId}`;
      if (stepKey !== h.nomineeLandingDefaultsStepKey) {
        h.nomineeLandingDefaultsStepKey = stepKey;
        postFrame.push(() => {
          if (!mounted()) return;
          if (h.nomineeLandingDefaultsStepKey !== stepKey) return;
          ensureNomineeLandingDefaultNoChecked(fieldList);
        });
      }
    } else if (h.nomineeLandingDefaultsStepKey != null) {
      h.nomineeLandingDefaultsStepKey = null;
    }

    const isSegmentsScreen = position === 'segments';

    if (isSegmentsScreen) {
      const pageId = toStrOrNull(ctx?.page?.id) ?? '';
      const stepKey = `${position ?? ''}|${pageId}`;
      if (stepKey !== h.segmentsBrokerageStepKey) {
        h.segmentsBrokerageStepKey = stepKey;
        postFrame.push(() => {
          if (!mounted()) return;
          if (h.segmentsBrokerageStepKey !== stepKey) return;
          h.segmentsBrokerageUserConfirmed = false;
          const bpv = formNotifier.formData.brokerage_plan;
          const bp = bpv != null ? toStr(bpv).trim() : '';
          if (bp.length > 0) {
            formNotifier.handleChange('brokerage_plan', '');
          }
          rerender();
        });
      }
    } else {
      if (h.segmentsBrokerageStepKey != null) {
        h.segmentsBrokerageStepKey = null;
        postFrame.push(() => {
          if (!mounted()) return;
          h.segmentsBrokerageUserConfirmed = false;
          rerender();
        });
      }
    }

    // Segment defaults — never call handleChange during build (causes freeze).
    // Mandatory segments (NSE/BSE cash, MF) are shown ticked + locked for every company, so they
    // must also be present in formData (else validation says "NSE CASH is required").
    // FO defaults / SLBM-off stay BP Wealth only.
    if (isSegmentsScreen) {
      const pageId = toStrOrNull(ctx?.page?.id) ?? '';
      const defaultsStepKey = `${position ?? ''}|${pageId}`;
      if (defaultsStepKey !== h.segmentsBpDefaultsStepKey) {
        h.segmentsBpDefaultsStepKey = defaultsStepKey;
        postFrame.push(() => {
          if (!mounted()) return;
          if (h.segmentsBpDefaultsStepKey !== defaultsStepKey) return;
          const mandatorySegmentKeys = ['nse_cash', 'bse_cash', 'mf'];
          const optionalDefaultKeys = ['nse_fo', 'bse_fo'];
          let didApplyDefaults = false;
          for (const key of mandatorySegmentKeys) {
            if (formNotifier.formData[key] !== true) {
              formNotifier.handleChange(key, true);
              didApplyDefaults = true;
            }
          }
          if (widget.company.toLowerCase() === 'bpwealth') {
            for (const key of optionalDefaultKeys) {
              if (formNotifier.formData[key] == null) {
                formNotifier.handleChange(key, true);
                didApplyDefaults = true;
              }
            }
            // NSE SLBM: always unchecked and non-selectable.
            if (formNotifier.formData.nse_slbm !== false) {
              formNotifier.handleChange('nse_slbm', false);
              didApplyDefaults = true;
            }
          }
          if (didApplyDefaults) {
            debugPrint(`[HomePage] Applied segment defaults for ${widget.company}`);
          }
        });
      }
    } else if (h.segmentsBpDefaultsStepKey != null) {
      h.segmentsBpDefaultsStepKey = null;
    }

    // Show segments selection UI for segments screen
    if (isSegmentsScreen) {
      const planV = formNotifier.formData.brokerage_plan;
      const hasPlanNow = h.segmentsBrokerageUserConfirmed && (planV != null ? toStr(planV).trim().length > 0 : false);
      return (
        <View
          style={{
            marginHorizontal: 12,
            marginVertical: 16,
            paddingLeft: KycTheme.spacing3xl,
            paddingTop: KycTheme.spacing2xl,
            paddingRight: KycTheme.spacing3xl,
            paddingBottom: KycTheme.spacing2xl,
            backgroundColor: KycTheme.surface,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: KycTheme.border,
            ...KycTheme.cardShadow,
          }}>
          <SegmentsSelection
            formData={formNotifier.formData}
            onChange={(name: string, value: any) => {
              if (name === 'nse_cash' || name === 'bse_cash' || name === 'mf') {
                if (value !== true) return;
              }
              if (name === 'nse_slbm') {
                return;
              }
              formNotifier.handleChange(name, value);
            }}
            onViewBrokeragePlan={() => {
              h.brokeragePlanDialogVisible = true;
              rerender();
            }}
            onSubmit={() => {
              if (h.submitLoading) return;
              // Locked (always ticked) segments must be in formData before validation.
              for (const key of ['nse_cash', 'bse_cash', 'mf']) {
                if (formNotifier.formData[key] !== true) {
                  formNotifier.handleChange(key, true);
                }
              }
              const pv = formNotifier.formData.brokerage_plan;
              const hasPlan = h.segmentsBrokerageUserConfirmed && (pv != null ? toStr(pv).trim().length > 0 : false);
              if (!hasPlan) {
                Fluttertoast.showToast({
                  msg: 'Please select a brokerage plan to continue',
                  gravity: 'TOP',
                  backgroundColor: MaterialColors.orangeShade700,
                  textColor: '#FFFFFF',
                });
                return;
              }

              if (isAuth) {
                void handleCommonSubmit(false);
              } else {
                void handleSubmit(false);
              }
            }}
            submitLoading={h.submitLoading}
            hasBrokeragePlanSelected={hasPlanNow}
          />
        </View>
      );
    }
    const visibleFields = fieldList.filter(f => {
      if (!isMap(f)) return false;
      const name = toStrOrNull(f.name);
      const initialShow = CF.kycFieldVisibleForFormStep(f, {
        company: widget.company,
        position,
        pageLabel,
      });

      // If conditional flow has explicitly set visibility, use that (takes precedence)
      // Otherwise, use API visibility (+ BP Wealth personal_details standing override)
      const dynamicVisibility = name != null ? formNotifier.fieldVisibility[name] : undefined;
      const show = dynamicVisibility ?? initialShow;

      return show;
    });

    const pageId = toStrOrNull(ctx?.page?.id);
    const pickedOtpField = pickOtpFieldForContext(visibleFields, position, pageId);
    const nomineeOptOutOtp = isNomineeOptOutOtpStep({
      fields: visibleFields,
      otpField: pickedOtpField,
    });
    // Nominee opt-out OTP: normal labelled field + Submit (not SMS OtpVerify card).
    const otpField = nomineeOptOutOtp ? null : pickedOtpField;
    const otpFieldName = toStrOrNull(pickedOtpField?.name);

    // Hide sirf "confirm OTP" / re-enter OTP type field – design: one OTP entry
    // Account number jaise "Confirm Account Number" fields ko HIDE mat karo
    // Filter step-specific fields: no mobile inputs on mobile_otp, no email input on email_otp
    const isMobileOtpScreen = position === 'mobile_otp';
    const isEmailOtpScreen = position === 'email_otp';

    const visibleFieldsForDisplay = visibleFields.filter(f => {
      if (!isMap(f)) return false;

      // On mobile_otp screen: hide mobile number inputs, keep OTP fields (e.g. otp_nom).
      if (isMobileOtpScreen && !isOtpFormField(f)) {
        const fieldName = (toStrOrNull(f.name) ?? '').toLowerCase();
        if (
          fieldName === 'mobile' ||
          fieldName === 'phone' ||
          fieldName === 'mobile_number' ||
          fieldName === 'phone_number' ||
          fieldName.includes('mobile') ||
          fieldName.includes('phone')
        ) {
          return false;
        }
      }

      // On email_otp screen: HIDE email input field (OTP only; no email field below)
      if (isEmailOtpScreen) {
        const fieldName = (toStrOrNull(f.name) ?? '').toLowerCase();
        const isOtpField = isOtpFormField(f);
        if (!isOtpField && (fieldName === 'email' || fieldName === 'email_id' || fieldName === 'emailid' || fieldName.includes('email'))) {
          return false; // Hide email input on OTP verify screen
        }
      }

      // Agar OTP field identified hai aur yeh field usi OTP ko validateWith kar rahi hai
      // (confirm OTP / re-enter OTP), tabhi hide karo
      if (otpFieldName != null && (f.validateWith != null ? toStr(f.validateWith) : '') === otpFieldName) {
        return false;
      }

      // Nominee: hide ghost PAN/Aadhaar boxes (nominee 2 / 3) with no label.
      if (
        FV.isNomineeExtendedUiStep(position, pageLabel) &&
        FV.shouldHideNomineeGhostInputField({
          field: f,
          formData: formNotifier.formData,
          fields: fieldList,
        })
      ) {
        return false;
      }

      // Baaki sab fields (including reenter_account_number) dikhao
      return true;
    });

    // Sequence: OTP field pahle dikhao, phir baaki fields
    if (otpField != null) {
      visibleFieldsForDisplay.sort((a, b) => {
        const aIsOtp = a.name === otpFieldName;
        const bIsOtp = b.name === otpFieldName;
        if (aIsOtp && !bIsOtp) return -1;
        if (!aIsOtp && bIsOtp) return 1;
        return 0;
      });
    }

    // Extract Aadhaar image (Digilocker success) from "aadhar_image" field
    let aadharImageBase64: string | null = null;
    let aadharImageUrl: string | null = null;
    let hasAadharImage = false;

    const isDigilockerScreen = position === 'digilocker' || pageLabel === 'digilocker';
    if (isDigilockerScreen) {
      const aadharField =
        visibleFieldsForDisplay.find(f => {
          if (f == null) return false;
          const n = (toStrOrNull(f.name) ?? '').toLowerCase();
          return n === 'aadhar_image' || n === 'aadhaar_image';
        }) ?? null;

      if (aadharField != null) {
        const aName = toStrOrNull(aadharField.name) ?? '';
        const rawValue = CF.resolveDigilockerAadharImageRaw({
          userDetails: s.userDetails,
          fieldValue: aadharField.value,
          formValue: formNotifier.formData[aName],
        });
        const valueStr = rawValue != null ? toStr(rawValue) : '';
        if (valueStr.length > 0) {
          if (valueStr.startsWith('http')) {
            aadharImageUrl = CF.cacheBustDocumentUrl(valueStr, {
              version: CF.digilockerAadharImageCacheBustVersion(s.userDetails),
            });
          } else {
            let base64Data = valueStr.trim();
            const match = /data:image\/[^;]+;base64,/i.exec(base64Data);
            if (match != null) {
              base64Data = base64Data.substring(match.index + match[0].length);
            }
            try {
              base64ToBytes(base64Data);
              aadharImageBase64 = base64Data.replace(/[\r\n\s]/g, '');
            } catch (_) {
              aadharImageBase64 = null;
            }
          }
        }
        hasAadharImage = aadharImageBase64 != null || (aadharImageUrl != null && aadharImageUrl.length > 0);
      }
    }

    // Generic submit button: sirf tab dikhao jab OTP field nahi hai
    // Agar OTP field hai (chahe kitni bhi aur fields ho), sirf OtpVerifySection ka "Verify OTP" button use hoga
    const showGenericSubmit = otpField == null;
    const isOnboardingAuth = isOnboardingAuthStep(position, pageLabel);
    const hideOnboardingFooter = kHideOnboardingFormFooter && isOnboardingAuth;
    const showSecurityFooter = !hideOnboardingFooter;
    const isMobileStep = position === 'mobile' || pageLabel === 'mobile';
    const isNomineeStep = FV.isNomineeKycStep(position, pageLabel);
    const addingNominee = isNomineeStep && FV.isAddNomineeSelectedYes(formNotifier.formData);
    const nomineeBlocksSubmit = isNomineeSubmitDisabled(position, pageLabel);
    const fatcaBlocksSubmit =
      isPersonalDetailsStep(position, pageLabel) &&
      (h.fatcaTaxResidencyMustPickNo || fatcaTaxResidencyYesFields(fieldList).length > 0);
    const submitCtaDisabled =
      h.submitLoading || h.ssoInProgress || fatcaBlocksSubmit || isSendOtpDisabled(position) || nomineeBlocksSubmit;

    const rowsArgs = {
      visibleFieldsForDisplay,
      otpField,
      otpFieldName,
      hasAadharImage,
      activeFields,
      store: s,
      fieldList,
      position,
      pageLabel,
      ctx,
    };
    const formRows: React.ReactNode[] = bpWealthPersonalDetailsStandingUi(position, pageLabel)
      ? buildBpWealthPersonalWebFormLayout(rowsArgs)
      : isNomineeStep
        ? buildNomineeKycFormLayout(rowsArgs)
        : buildSequencedFormRowsWithStandingExpansion(rowsArgs);

    return (
      <View
        // No outer margin so width matches "Documents to keep Handy" card
        style={{
          padding: isMobileStep ? 20 : KycTheme.spacing2xl,
          backgroundColor: KycTheme.surface,
          borderRadius: KycTheme.radiusLg,
          borderWidth: 1,
          borderColor: KycTheme.border,
          ...KycTheme.cardShadow,
        }}>
        <View style={{alignItems: 'stretch'}}>
          {isPanKycStep(position, pageLabel) && h.panStepApiFeedback.trim().length > 0 ? (
            <View
              style={{
                alignSelf: 'stretch',
                marginBottom: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: h.panStepApiFeedbackIsError ? MaterialColors.redShade50 : MaterialColors.greenShade50,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: h.panStepApiFeedbackIsError ? MaterialColors.redShade300 : GREEN_300,
              }}>
              <Text
                style={{
                  color: h.panStepApiFeedbackIsError ? MaterialColors.redShade900 : GREEN_900,
                  fontSize: 14,
                  fontWeight: '500',
                }}>
                {h.panStepApiFeedback}
              </Text>
            </View>
          ) : null}
          {hasAadharImage ? (
            <>
              <View style={{height: 8}} />
              <AadharImagePreview base64={aadharImageBase64} url={aadharImageUrl} />
              <View style={{height: 16}} />
            </>
          ) : null}
          {formRows}
          {nomineeOptOutOtp && pickedOtpField != null ? (
            <>
              <View style={{height: 4}} />
              <OtpResendControls
                key={`nominee-otp-resend-${h.otpResendTimerEpoch}`}
                otpExpiry={resolveOtpExpiryConfig(visibleFields, pickedOtpField)}
                onResendOtp={() => void resendMobileOtp()}
                resendLoading={h.resendOtpLoading}
              />
              <View style={{height: 8}} />
            </>
          ) : null}
          {/* Terms & Conditions and Aadhaar note (mobile login step only) */}
          {isMobileStep ? (
            <>
              <View style={{height: 15}} />
              {/* Custom checkbox + clickable Terms and Conditions */}
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Pressable
                  onPress={() =>
                    setState(() => {
                      h.termsAccepted = !h.termsAccepted;
                      if (h.termsAccepted) h.showTermsError = false;
                    })
                  }
                  hitSlop={8}
                  style={{padding: 2}}>
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      backgroundColor: h.termsAccepted ? KycTheme.primary : 'transparent',
                      borderRadius: 3,
                      borderWidth: 1.5,
                      borderColor: h.termsAccepted ? KycTheme.primary : KycTheme.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {h.termsAccepted ? <MaterialIcon name="check" size={13} color="#FFFFFF" /> : null}
                  </View>
                </Pressable>
                <View style={{width: 8}} />
                <Pressable
                  style={{flex: 1}}
                  onPress={() =>
                    setState(() => {
                      h.termsAccepted = !h.termsAccepted;
                      if (h.termsAccepted) h.showTermsError = false;
                    })
                  }>
                  <Text style={{fontSize: 12, color: KycTheme.textPrimary, lineHeight: 12 * 1.25}}>
                    Please accept the{' '}
                    <Text
                      style={{color: KycTheme.primary, fontWeight: '600', textDecorationLine: 'underline'}}
                      onPress={() => showTermsModal()}>
                      Terms and Conditions
                    </Text>
                  </Text>
                </Pressable>
              </View>
              {h.showTermsError && !h.termsAccepted ? (
                <>
                  <View style={{height: 4}} />
                  <View style={{paddingLeft: 28, flexDirection: 'row', alignItems: 'flex-start'}}>
                    <MaterialIcon name="error_outline" size={14} color={RED_700} />
                    <View style={{width: 4}} />
                    <View style={{flex: 1}}>
                      <Text style={{fontSize: 11, color: RED_700}}>
                        Please accept the Terms & Conditions to continue
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}
              <View style={{height: 16}} />
              {buildAadhaarNote()}
              <View style={{height: 16}} />
            </>
          ) : null}
          {showGenericSubmit ? <View style={{height: 24}} /> : null}
          {showGenericSubmit ? (
            <ElevatedButton
              fullWidth
              minHeight={isMobileStep ? 52 : 48}
              paddingVertical={KycTheme.spacingLg}
              paddingHorizontal={0}
              borderRadius={isMobileStep ? 14 : KycTheme.radiusMd}
              backgroundColor={
                isMobileStep || isNomineeStep
                  ? submitCtaDisabled
                    ? KycTheme.buttonDisabledPurple
                    : KycTheme.buttonEnabledPurple
                  : KycTheme.primary
              }
              onPress={
                submitCtaDisabled
                  ? null
                  : () => {
                      debugPrint(`[HomePage] Submit button clicked! isAuth=${isAuth}, position=${position}`);
                      if (isAuth) {
                        if (enforceFatcaTaxResidencyNoOnSubmit({position, pageLabel, fieldList})) {
                          return;
                        }
                        void handleCommonSubmit(false);
                      } else {
                        void handleSubmit(false);
                      }
                    }
              }>
              {h.submitLoading && !h.ssoInProgress ? (
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                  <Spinner size={20} strokeWidth={2} color="#FFFFFF" />
                  <View style={{width: 12}} />
                  <Text style={{color: '#FFFFFF', fontSize: 16, fontWeight: '600'}}>Processing...</Text>
                </View>
              ) : (
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                  <Text style={{color: submitCtaDisabled ? 'rgba(29,27,32,0.38)' : '#FFFFFF', fontSize: 16, fontWeight: '600'}}>
                    {primarySubmitLabel({isMobileStep, submitButton})}
                  </Text>
                </View>
              )}
            </ElevatedButton>
          ) : null}
          {showGenericSubmit && submitButton?.showSubmitAnywayButton === true ? (
            <>
              <View style={{height: 16}} />
              <View
                style={{
                  padding: 12,
                  backgroundColor: YELLOW_50,
                  borderWidth: 1,
                  borderColor: YELLOW_200,
                  borderRadius: 12,
                  alignItems: 'stretch',
                }}>
                <Text style={{color: YELLOW_900}}>You can submit the form without filling field.</Text>
                <View style={{height: 12}} />
                <ElevatedButton
                  fullWidth
                  paddingVertical={16}
                  paddingHorizontal={0}
                  label={toStr(submitButton?.submitAnywayButtonName ?? 'Submit Anyway')}
                  onPress={
                    h.submitLoading || fatcaBlocksSubmit
                      ? null
                      : () => {
                          if (isAuth) {
                            if (enforceFatcaTaxResidencyNoOnSubmit({position, pageLabel, fieldList})) {
                              return;
                            }
                            void handleCommonSubmit(true);
                          } else {
                            void handleSubmit(true);
                          }
                        }
                  }
                />
              </View>
            </>
          ) : null}
          {showSecurityFooter ? (
            <>
              <View style={{height: 24}} />
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                <MaterialIcon name="lock" size={16} color={KycTheme.textSecondary} />
                <View style={{width: 8}} />
                <Text style={{fontSize: 12, color: KycTheme.textSecondary}}>Your information is securely encrypted</Text>
              </View>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  /** Disable Send OTP on mobile step until 10 digits entered AND terms accepted */
  function isSendOtpDisabled(position: string | null | undefined): boolean {
    if (position !== 'mobile') return false;
    if (!h.termsAccepted) return true;
    const mobile = formNotifier.formData.mobile ?? formNotifier.formData.phone ?? formNotifier.formData.mobile_number ?? '';
    const digits = toStr(mobile).replace(/\D/g, '');
    return digits.length !== 10 || !/^[6-9]/.test(digits);
  }

  function showTermsModal(): void {
    h.termsModalVisible = true;
    rerender();
  }

  function buildAadhaarNote(): React.ReactElement {
    return (
      <View
        style={{
          alignSelf: 'stretch',
          padding: KycTheme.spacingLg,
          backgroundColor: '#F1F5F9',
          borderRadius: KycTheme.radiusMd,
          borderWidth: 1,
          borderColor: KycTheme.border,
          flexDirection: 'row',
          alignItems: 'flex-start',
        }}>
        <View style={{width: 12}} />
        <View style={{flex: 1}}>
          <Text style={{fontSize: 13, color: KycTheme.textPrimary, lineHeight: 13 * 1.4}}>
            Note: Online account opening requires your number to be linked with Aadhaar. You can check if your mobile number is linked
            to Aadhaar{' '}
            <Text
              style={{color: KycTheme.primary, fontWeight: '600', textDecorationLine: 'underline'}}
              onPress={async () => {
                const url = 'https://resident.uidai.gov.in/verify';
                if (await Linking.canOpenURL(url)) {
                  await Linking.openURL(url);
                }
              }}>
              here
            </Text>
            . If your mobile number isn't linked to Aadhaar, please open your account offline.
          </Text>
        </View>
      </View>
    );
  }

  /** Extract 10-digit Indian mobile from form map only (no persisted fallback). */
  function digitsFromFormMapOnly(fd: AnyMap): string {
    const keys = ['change_mobile', 'mobile_number', 'mobile', 'phone'];
    for (const key of keys) {
      const raw = fd[key];
      if (raw == null) continue;
      const digits = toStr(raw).replace(/\D/g, '');
      if (digits.length === 10 && /^[6-9]/.test(digits)) {
        return digits;
      }
    }
    for (const key of keys) {
      const raw = fd[key];
      if (raw == null) continue;
      const digits = toStr(raw).replace(/\D/g, '');
      if (digits.length >= 10) {
        const last10 = digits.substring(digits.length - 10);
        if (/^[6-9]/.test(last10)) return last10;
      }
    }
    return '';
  }

  /** Prefer live form data; fall back to persistedMobileDigitsForOtp after get-context reset. */
  function resolveMobileDigitsForOtpUi(fd: AnyMap): string {
    const fromForm = digitsFromFormMapOnly(fd);
    if (fromForm.length === 10) return fromForm;
    const p = h.persistedMobileDigitsForOtp;
    if (p != null && p.length === 10 && /^[6-9]/.test(p)) {
      return p;
    }
    return '';
  }

  function applyPersistedMobileToForm(): void {
    const m = h.persistedMobileDigitsForOtp;
    if (m == null || m.length !== 10) return;
    formNotifier.handleChange('mobile_number', m, {validationType: 'mobile'});
    formNotifier.handleChange('phone', m, {validationType: 'mobile'});
    formNotifier.handleChange('mobile', m, {validationType: 'mobile'});
    formNotifier.handleChange('change_mobile', m, {validationType: 'mobile'});
  }

  function resolveEmailForOtpUi(fd: AnyMap): string {
    const keys = ['email', 'email_id', 'emailId'];
    for (const key of keys) {
      const raw = fd[key] != null ? toStr(fd[key]).trim() : '';
      if (raw.includes('@')) return raw;
    }
    const p = h.persistedEmailForOtp?.trim() ?? '';
    return p.includes('@') ? p : '';
  }

  function applyPersistedEmailToForm(): void {
    const e = h.persistedEmailForOtp?.trim() ?? '';
    if (!e.includes('@')) return;
    formNotifier.handleChange('email', e, {validationType: 'email'});
    formNotifier.handleChange('email_id', e, {validationType: 'email'});
    formNotifier.handleChange('emailId', e, {validationType: 'email'});
  }

  async function handleGoogleSignIn(): Promise<void> {
    if (h.googleSignInLoading) return;
    setState(() => {
      h.googleSignInLoading = true;
    });
    try {
      GoogleSignin.configure({
        scopes: ['email', 'profile'],
        // Android: Web client ID is required so Google returns an ID token for Firebase Auth.
        webClientId: Platform.OS === 'android' ? DefaultFirebaseOptions.googleOAuthWebClientId : undefined,
      });
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices();
      }
      const signInResult = await GoogleSignin.signIn();
      if (signInResult.type !== 'success') {
        Fluttertoast.showToast({
          msg: 'Sign-in cancelled',
          gravity: 'TOP',
        });
        return;
      }
      const selectedAccountEmail = signInResult.data.user.email;

      const tokens = await GoogleSignin.getTokens();
      const idToken = signInResult.data.idToken ?? tokens.idToken;
      if (idToken == null || idToken.length === 0) {
        debugPrint('[GoogleSignIn] idToken missing; check SHA-1 in Firebase & Web client ID.');
        Fluttertoast.showToast({
          msg: 'Could not get Google credentials. Check app signing (SHA-1) in Firebase.',
          gravity: 'TOP',
        });
        return;
      }
      const credential = GoogleAuthProvider.credential(idToken, tokens.accessToken);
      const userCredential = await signInWithCredential(getAuth(), credential);
      const email = (userCredential.user?.email ?? selectedAccountEmail).trim();
      if (email.length === 0) {
        Fluttertoast.showToast({
          msg: 'Google account email not available',
          gravity: 'TOP',
        });
        return;
      }

      h.persistedEmailForOtp = email;
      applyPersistedEmailToForm();
      Fluttertoast.showToast({
        msg: 'Google sign-in successful',
        gravity: 'TOP',
      });
    } catch (e: any) {
      const code: string | undefined = typeof e?.code === 'string' ? e.code : undefined;
      if (code != null && code.startsWith('auth/')) {
        // FirebaseAuthException
        debugPrint(`[GoogleSignIn] FirebaseAuthException: ${code} ${e?.message}`);
        Fluttertoast.showToast({
          msg: e?.message ?? 'Google sign-in failed',
          gravity: 'TOP',
        });
      } else if (code != null) {
        // PlatformException
        debugPrint(`[GoogleSignIn] PlatformException: ${code} ${e?.message}`);
        const msg =
          code === 'sign_in_failed' || code === '10' || code === 'DEVELOPER_ERROR'
            ? 'Google Sign-In setup error. Add debug SHA-1 in Firebase Console.'
            : (e?.message ?? 'Google sign-in failed');
        Fluttertoast.showToast({msg, gravity: 'TOP'});
      } else {
        debugPrint(`[GoogleSignIn] ${e}\n${e?.stack ?? ''}`);
        Fluttertoast.showToast({
          msg: 'Unable to sign in with Google. Please try again.',
          gravity: 'TOP',
        });
      }
    } finally {
      if (mounted()) {
        setState(() => {
          h.googleSignInLoading = false;
        });
      }
    }
  }

  /** Edit from OTP screen: `GET /api_review_edit_page/...` — only on success refresh journey via get-context. */
  async function requestReviewEditAndRefreshContext(currentField: string): Promise<void> {
    const s = store;
    if (!mounted()) return;
    setState(() => {
      captureHeaderPositionForSubmit(s);
      h.submitLoading = true;
    });
    try {
      debugPrint(`[HomePage] review_edit_page: ${currentField} (${widget.company}/${widget.workflowName})`);
      const res = await KycAPI.reviewEditPage(widget.company, widget.workflowName, currentField);
      let body: AnyMap | null;
      try {
        body = decodeJsonMapOrNull(res.body);
      } catch (_) {
        body = null;
      }
      const success = body?.success === true || (body?.success != null && toStr(body.success) === 'true');
      if (res.statusCode < 200 || res.statusCode >= 300 || !success) {
        const msg = (body?.msg != null ? toStr(body.msg) : null) ?? (body?.message != null ? toStr(body.message) : null) ?? 'Could not open edit for this step';
        Fluttertoast.showToast({msg, gravity: 'TOP'});
        return;
      }
      debugPrint('[HomePage] review_edit_page OK — fetching get-context');
      await s.fetchWorkflowFieldsWithAuth(widget.company, widget.workflowName, '');
      if (!mounted()) return;
      if (s.errorWithAuth != null) {
        Fluttertoast.showToast({msg: s.errorWithAuth, gravity: 'TOP'});
        return;
      }
      if (mounted()) {
        await delay(200);
        await checkAndHandleRedirect(s);
        if (!mounted()) return;
        const response = s.fieldsWithAuth;
        if (!isMap(response) || response.redirect !== true) {
          goTo(`/${widget.company}/${widget.workflowName}`);
        }
      }
    } catch (e: any) {
      debugPrint(`[HomePage] review_edit_page error: ${e}\n${e?.stack ?? ''}`);
      Fluttertoast.showToast({msg: 'Something went wrong. Please try again.', gravity: 'TOP'});
    } finally {
      if (mounted()) {
        setState(() => {
          h.submitLoading = false;
        });
      }
    }
  }

  /** Nominee opt-out OTP (page 16 / otp_nom) — use standard form, not mobile SMS verify card. */
  function isNomineeOptOutOtpStep(opts: {fields: any[]; otpField: AnyMap | null}): boolean {
    const {fields, otpField} = opts;
    if (otpField != null) {
      const n = (toStrOrNull(otpField.name) ?? '').toLowerCase();
      const dn = (toStrOrNull(otpField.displayName) ?? '').toLowerCase();
      if (n.includes('nom') || n === 'otp_nom') return true;
      if (dn.includes('nominee') && dn.includes('otp')) return true;
    }
    for (const f of fields) {
      if (!isMap(f)) continue;
      if (isMap(f.otpExpiry)) {
        const ref = (toStrOrNull(f.otpExpiry.otpField) ?? '').toLowerCase();
        if (ref.includes('nom')) return true;
      }
      const dn = (toStrOrNull(f.displayName) ?? '').toLowerCase();
      if (dn.includes('nominee') && dn.includes('opt') && dn.includes('otp')) {
        return true;
      }
    }
    return false;
  }

  function isOtpFormField(f: AnyMap): boolean {
    const t = (toStrOrNull(f.type) ?? '').toLowerCase();
    const n = (toStrOrNull(f.name) ?? '').toLowerCase();
    const v = (toStrOrNull(f.validation) ?? '').toLowerCase();
    if (t === 'otp' || v === 'otp') return true;
    if (n === 'otp' || n === 'otp_code') return true;
    if (n.includes('otp')) return true;
    return false;
  }

  /** Picks the OTP input for this page when multiple OTP fields exist (e.g. mobile_otp vs mobile_otp_nom). */
  function pickOtpFieldForContext(fields: any[], position: string | null | undefined, pageId: string | null | undefined): AnyMap | null {
    const candidates: AnyMap[] = fields.filter(f => isMap(f)).filter(f => isOtpFormField(f)) as AnyMap[];
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    for (const f of fields) {
      if (!isMap(f) || !isMap(f.otpExpiry)) continue;
      const ref = toStrOrNull(f.otpExpiry.otpField);
      if (ref == null || ref.length === 0) continue;
      const match = candidates.filter(c => toStrOrNull(c.name) === ref);
      if (match.length > 0) return match[0];
    }

    const pageNum = intTryParse(pageId ?? '');
    const nomineeCandidates = candidates.filter(c => (toStrOrNull(c.name) ?? '').toLowerCase().includes('nom'));
    // Later workflow pages (e.g. id 16) reuse position mobile_otp for nominee OTP.
    if (nomineeCandidates.length > 0 && pageNum != null && pageNum >= 10) {
      return nomineeCandidates[0];
    }

    const primaryCandidates = candidates.filter(c => !(toStrOrNull(c.name) ?? '').toLowerCase().includes('nom'));
    return primaryCandidates.length > 0 ? primaryCandidates[0] : candidates[0];
  }

  function resolveOtpExpiryConfig(fields: any[], otpField: AnyMap | null | undefined): AnyMap | null {
    if (otpField == null) return null;
    const name = toStrOrNull(otpField.name);
    const direct = otpField.otpExpiry;
    if (isMap(direct)) return {...direct};
    if (name != null) {
      for (const f of fields) {
        if (!isMap(f) || !isMap(f.otpExpiry)) continue;
        const exp: AnyMap = {...f.otpExpiry};
        if (toStrOrNull(exp.otpField) === name) return exp;
      }
    }
    return null;
  }


  /** OTP verify card: separate UI for email_otp vs mobile_otp (Figma) */
  async function resendOtpByPosition(opts: {
    store: AppStore;
    positionSegment: string;
    payload: AnyMap;
    failureMessage: string;
  }): Promise<boolean> {
    const endpoint = `/api/resend-otp/${opts.positionSegment}`;
    debugPrint(`[HomePage] Resend OTP via ${endpoint} payload=${JSON.stringify(opts.payload)}`);
    const res = await ApiClient.post(endpoint, {body: opts.payload});
    debugPrint(`[HomePage] Resend OTP response status=${res.statusCode}`);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      Fluttertoast.showToast({
        msg: errorMessageFromResponse(res.statusCode, res.body),
        gravity: 'TOP',
      });
      return false;
    }
    if (mounted()) {
      setState(() => {
        h.otpResendTimerEpoch++;
      });
      Fluttertoast.showToast({
        msg: 'OTP sent successfully',
        gravity: 'TOP',
      });
    }
    return true;
  }

  function getResendOtpPositionSegment(ctx: AnyMap | null | undefined, fallbackPosition: string): string {
    const position = (toStrOrNull(ctx?.position)?.toLowerCase() ?? '').trim();
    const pageId = (toStrOrNull(ctx?.page?.id) ?? '').trim();
    const effectivePosition = position.length > 0 ? position : fallbackPosition;
    if (pageId.length === 0) return effectivePosition;
    return `${effectivePosition}${pageId}`;
  }

  async function resendMobileOtp(): Promise<void> {
    const s = store;
    Keyboard.dismiss();
    if (!mounted()) return;
    setState(() => {
      h.resendOtpLoading = true;
    });
    try {
      const ctx = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
      const resendPositionSegment = getResendOtpPositionSegment(ctx, 'mobile_otp');
      await resendOtpByPosition({
        store: s,
        positionSegment: resendPositionSegment,
        payload: {},
        failureMessage: 'Failed to resend OTP',
      });
    } finally {
      if (mounted()) {
        setState(() => {
          h.resendOtpLoading = false;
        });
      }
    }
  }

  async function resendEmailOtpAfterEdit(email: string): Promise<void> {
    const s = store;
    const trimmed = email.trim();
    h.persistedEmailForOtp = trimmed;
    Keyboard.dismiss();
    if (!mounted()) return;
    setState(() => {
      h.resendOtpLoading = true;
    });
    try {
      const ctx = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
      const resendPositionSegment = getResendOtpPositionSegment(ctx, 'email_otp');
      const payload: AnyMap = {email: trimmed};
      await resendOtpByPosition({
        store: s,
        positionSegment: resendPositionSegment,
        payload,
        failureMessage: 'Failed to refresh OTP step',
      });
      if (mounted()) {
        applyPersistedEmailToForm();
      }
    } catch (_) {
      Fluttertoast.showToast({msg: 'Failed to resend email OTP', gravity: 'TOP'});
    } finally {
      if (mounted()) {
        setState(() => {
          h.resendOtpLoading = false;
        });
      }
    }
  }

  // Previous flow: Edit opened a modal and then called get-user / kyc-post resend.
  // Replaced by `requestReviewEditAndRefreshContext` → GET `/api_review_edit_page/...` then get-context.

  function buildOtpVerifyCard(otpField: AnyMap, activeFields: any): React.ReactElement {
    const otpName = toStrOrNull(otpField.name) ?? 'otp';
    const formData = formNotifier.formData;
    const s = store;
    const ctxNow = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
    const position = toStrOrNull(ctxNow?.position)?.toLowerCase() ?? '';
    const isEmailOtp = position === 'email_otp' || position.startsWith('email_otp');
    const isMobileOtp = position === 'mobile_otp' || position.startsWith('mobile_otp');

    // Step-specific copy: no mobile/SMS wording on email_otp
    let sentToText: string;
    let onEdit: (() => void) | null;
    if (isEmailOtp) {
      const displayEmail = resolveEmailForOtpUi(formData);
      sentToText = `We have sent you an OTP on ${displayEmail.length === 0 ? 'your email' : displayEmail}`;
      onEdit = () => {
        void requestReviewEditAndRefreshContext('change_email');
      };
    } else {
      const displayDigits = resolveMobileDigitsForOtpUi(formData);
      sentToText = `We have sent you an OTP via sms on +91 ${displayDigits.length === 0 ? '' : displayDigits}`;
      onEdit = isMobileOtp
        ? () => {
            void requestReviewEditAndRefreshContext('change_mobile');
          }
        : null;
    }

    const fieldList = Array.isArray(activeFields) ? activeFields : [];
    const otpExpiry = resolveOtpExpiryConfig(fieldList, otpField);
    if (otpExpiry != null) {
      debugPrint(`[HomePage] OTP expiry config: ${JSON.stringify(otpExpiry)}`);
    }

    return (
      <View style={{alignItems: 'stretch'}}>
        <OtpVerifySection
          key={`otp-${position}-${h.otpResendTimerEpoch}`}
          sentToText={sentToText}
          onEdit={onEdit}
          onVerify={(otp: string) => {
            formNotifier.handleChange(otpName, otp);
            void handleCommonSubmit(false);
          }}
          onResendOtp={() => {
            debugPrint('[HomePage] Resend OTP clicked');
            formNotifier.handleChange(otpName, '');
            if (isMobileOtp) {
              void resendMobileOtp();
            } else {
              const email = resolveEmailForOtpUi({...formNotifier.formData});
              if (!email.includes('@')) {
                Fluttertoast.showToast({
                  msg: 'Please use Edit to enter a valid email',
                  gravity: 'TOP',
                });
                return;
              }
              void resendEmailOtpAfterEdit(email);
            }
          }}
          otpExpiry={otpExpiry}
          verifyLoading={h.submitLoading}
          resendLoading={h.resendOtpLoading}
          useSixBoxes={false} // Email OTP: single input per Figma (no 6 boxes)
        />
        <View style={{height: 20}} />
        <KycNoteBox
          text={KycNoteBox.aadhaarNote}
          linkText="here"
          onLinkTap={() => {
            // Optional: open Aadhaar link
          }}
        />
      </View>
    );
  }


  // ---------- build() ----------

  /** Flutter `WidgetsBinding.addPostFrameCallback` queue – flushed after this render commits. */
  const postFrame: Array<() => void> = [];

  /** Flutter `Scaffold(backgroundColor, body: SafeArea(child))`. */
  function scaffold(bg: string, child: React.ReactNode, safeArea = true): React.ReactElement {
    return (
      <KeyboardAvoidingView style={{flex: 1, backgroundColor: bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {safeArea ? <SafeAreaView style={{flex: 1}}>{child}</SafeAreaView> : child}
      </KeyboardAvoidingView>
    );
  }

  function renderScreen(): React.ReactElement {
    const s = store;
    const activeFields = activeFieldsForUi(s);
    const fieldList = (activeFields?.fields as any[] | null | undefined) ?? [];
    const conditionalFlow = activeFields?.conditionalFlow as any[] | null | undefined;
    const submitButton: AnyMap | null = isMap(activeFields?.submitButton) ? activeFields.submitButton : null;

    const isAuthenticated = h.isAuthenticated;
    postFrame.push(() => {
      if (!mounted()) return;
      if (h.submitLoading && h.submitFrozenPage != null) return;
      const ctxSync = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
      const syncKey = [toStrOrNull(ctxSync?.position) ?? '', toStrOrNull(ctxSync?.page?.id) ?? '', s.rpdReturn, fieldList.length].join(
        '|',
      );
      if (h.activeFieldsSyncKey === syncKey) return;
      h.activeFieldsSyncKey = syncKey;
      formNotifier.updateFields(fieldList, conditionalFlow, {fieldsWithAuth: s.fieldsWithAuth});
      // Must run in same callback *after* updateFields so API `value` is in formData first.
      applyApiDefaultValues(fieldList);
      runPersonalDetailsBpWealthPipeline(s, fieldList);
      applyRpdReturnFieldIfNeeded(s, fieldList);
      syncDigilockerAadharImage(s, fieldList, {
        position: toStrOrNull(ctxSync?.position),
        pageLabel: toStrOrNull(ctxSync?.page?.data?.label),
      });
      const pos = (toStrOrNull(ctxSync?.position) ?? '').toLowerCase();
      const label = (toStrOrNull(ctxSync?.page?.data?.label) ?? '').toLowerCase();
      if (pos === 'mobile' || label === 'mobile') {
        const pageId = toStrOrNull(ctxSync?.page?.id) ?? '';
        const termsKey = `mobile|${pageId}`;
        if (h.mobileTermsAutoSelectedStepKey !== termsKey || !h.termsAccepted) {
          h.mobileTermsAutoSelectedStepKey = termsKey;
          h.termsAccepted = true;
          h.showTermsError = false;
        }
      } else {
        h.mobileTermsAutoSelectedStepKey = null;
      }
    });

    // --- Stepper UI (hidden temporarily) ---
    // Re-enable showStepper + stepperWidget when bringing the stepper back.
    const showStepper = false;
    // Placeholder so existing showStepper branches compile while stepper is off.
    const stepperWidget = <View />;

    // Partial loader / retry while returning from WebView.
    // Checked before anything else so the old step's form UI is NEVER
    // rendered between WebView exit and both API calls completing.
    // Refresh and Logout buttons remain visible so the user always
    // has an escape hatch — only the content area shows the loader.
    if (s.isReturningFromWebView) {
      return scaffold(
        KycTheme.background,
        <View style={{flex: 1, alignItems: 'stretch'}}>
          {isAuthenticated
            ? buildAuthenticatedHeaderActions(s, {
                refreshBusyOverride: h.loadWorkflowActive,
                onRefreshOverride:
                  h.loadWorkflowActive || h.logoutLoading
                    ? null
                    : () => {
                        void refreshWorkflowFromHeader(s);
                      },
              })
            : null}
          {/* Stepper stays visible throughout (hidden — see showStepper above) */}
          {/* Content area: spinner or retry */}
          <View style={{flex: 1}}>
            {h.webViewReturnError != null ? buildWebViewReturnRetryContent(s) : buildWebViewReturnLoaderContent()}
          </View>
        </View>,
      );
    }

    // Subtle loader shown just before navigating to WebView.
    // Paired with the fade transition on the webview route to guarantee
    // smooth transition without flash of home-page UI.
    if (h.webViewTransitionActive) {
      return scaffold(
        '#FFFFFF',
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <Spinner size={32} strokeWidth={3} color={KycTheme.primary} />
          <View style={{height: 16}} />
          <Text style={{fontSize: 14, fontWeight: '500', color: KycTheme.textSecondary}}>Opening verification...</Text>
        </View>,
        false,
      );
    }

    if (h.ssoInProgress) {
      return scaffold(KycTheme.background, <Loader message="Signing you in..." />);
    }

    if (h.loadWorkflowActive) {
      return scaffold(KycTheme.background, <Loader message="Setting up your KYC journey..." />);
    }

    if (responseIndicatesKycCompleted(s.fieldsWithAuth) || h.navigatingToKycCompleted) {
      postFrame.push(() => {
        if (!mounted()) return;
        void navigateToKycCompletedIfNeeded(s);
      });
      return scaffold(KycTheme.background, <Loader message="Loading your KYC status..." />);
    }

    // Handle loading states - full screen when no stepper, else loader below stepper
    if (s.loading && !h.ssoInProgress) {
      return scaffold(
        KycTheme.background,
        showStepper ? (
          <View style={{flex: 1}}>
            {stepperWidget}
            <View style={{flex: 1}}>
              <Loader message="Setting up your KYC journey..." minimal />
            </View>
          </View>
        ) : (
          <Loader message="Setting up your KYC journey..." />
        ),
      );
    }

    if (s.error != null) {
      return buildApiErrorScaffold({
        store: s,
        message: s.error,
        isAuthenticated,
      });
    }

    // get-context refresh (not submit): full-screen loader. Submit keeps button spinner.
    if (s.loadingWithAuth && !h.submitLoading && !h.ssoInProgress) {
      return buildStepTransitionScaffold({
        showStepper,
        stepperWidget,
        message: 'Loading your next step...',
      });
    }

    // Show error if get-context API failed (502, server HTML, technical tokens, etc.)
    // PDF encrypted/closed: keep upload step visible (previous context still valid).
    if (s.errorWithAuth != null) {
      if (s.hasPdfDocumentEncryptedContextError && isMap(s.fieldsWithAuth)) {
        postFrame.push(() => {
          if (!mounted()) return;
          if (!s.hasPdfDocumentEncryptedContextError) return;
          recoverFromPdfDocumentEncryptedError(s);
        });
      } else {
        return buildApiErrorScaffold({
          store: s,
          message: s.hasPdfDocumentEncryptedContextError ? kPdfDocumentEncryptedUserMessage : s.errorWithAuth,
          isAuthenticated,
          onRetry: async () => {
            if (s.hasPdfDocumentEncryptedContextError && !isMap(s.fieldsWithAuth)) {
              // Stuck session after encrypted PDF with no step context —
              // reset auth so user can continue from a clean upload journey.
              await StorageService.clearAuthTokens();
              s.clearAuthError();
              if (mounted()) await loadWorkflow();
              return;
            }
            if (s.invalidUserSession) {
              const ssoOk = await recoverInvalidSessionViaSso(s);
              if (ssoOk && mounted()) {
                await loadWorkflow();
              }
            } else {
              await loadWorkflow();
            }
          },
        });
      }
    }

    // Get page title from context.page.data.label or context.page.name, fallback to title/pageTitle
    const ctx: AnyMap | null = isMap(s.fieldsWithAuth) && isMap(s.fieldsWithAuth.context) ? s.fieldsWithAuth.context : null;
    const page: AnyMap | null = isMap(ctx?.page) ? ctx!.page : null;
    const pageData: AnyMap | null = isMap(page?.data) ? page!.data : null;
    const rawPageLabel = toStrOrNull(pageData?.label);
    const pageName = toStrOrNull(page?.name);
    const rawPosition = toStrOrNull(ctx?.position);

    let pageTitle: string | null = null;

    if (ctx == null) {
      // Hero title only on true first screen (no token). Mid-journey never show it.
      if (isAuthenticated || isMidAuthenticatedJourney(s)) {
        pageTitle = h.cachedPageTitle;
      } else {
        pageTitle = 'Start your KYC or pickup where you left off';
      }
    } else {
      // Prefer human-friendly titles from context / activeFields.
      let pageLabel: string | null = rawPageLabel;

      // If backend label is same as technical position (e.g. "personal_details"),
      // don't show it as a title – stepper already shows the step name.
      if (rawPageLabel != null && rawPosition != null && rawPageLabel.toLowerCase().trim() === rawPosition.toLowerCase().trim()) {
        pageLabel = null;
      }

      pageTitle =
        pageLabel ??
        pageName ??
        (isMap(activeFields) ? toStrOrNull(activeFields.title ?? activeFields.pageTitle) : null);

      // If title still looks like a technical key (all lowercase/underscores),
      // hide it and rely on the stepper only.
      if (pageTitle != null) {
        const simple = pageTitle.trim();
        const isCodeStyle = /^[a-z0-9_]+$/.test(simple);
        if (isCodeStyle) {
          pageTitle = null;
        }
      }
      cacheAuthenticatedStepUi({
        store: s,
        ctx,
        pageTitle,
        activePage: activeFields,
      });
    }

    const showDocumentsSection = false;

    const backButton =
      isAuthenticated && (submitButton?.backShowButton ?? false) ? (
        <IconButton
          disabled={h.backLoading}
          onPress={() => {
            // Navigator.of(context).maybePop()
            if (navigationRef.isReady() && navigationRef.canGoBack()) navigationRef.goBack();
          }}>
          {h.backLoading ? (
            <Spinner size={24} strokeWidth={2} color={KycTheme.primary} />
          ) : (
            <MaterialIcon name="arrow_back" size={24} color={KycTheme.textPrimary} />
          )}
        </IconButton>
      ) : undefined;

    // `showStepper` is a compile-time `false` in the Flutter app; only the non-stepper branch is reachable.
    return scaffold(
      KycTheme.background,
      <View style={{flex: 1, alignItems: 'stretch'}}>
        {isAuthenticated ? buildAuthenticatedHeaderActions(s) : null}
        <View style={{flex: 1}}>
          <KycLayout
            title={pageTitle}
            stepperSteps={null}
            stepperIndex={null}
            skipScaffold
            leading={backButton}
            trailing={null}
            showDocumentsSection={showDocumentsSection}>
            {buildForm(fieldList, activeFields, submitButton, s, isAuthenticated)}
          </KycLayout>
        </View>
      </View>,
    );
  }

  // ---------- Dialogs (Flutter showDialog / showModalBottomSheet) ----------

  const DIALOG_BARRIER = 'rgba(0,0,0,0.54)';

  function renderOverlays(): React.ReactNode {
    const dialogBodyStyle = {fontSize: 14, color: KycTheme.textPrimary, lineHeight: 14 * 1.45};
    return (
      <>
        {/* FATCA: eKYC cannot proceed when tax residency outside India is Yes. */}
        <Modal
          visible={h.fatcaModalVisible}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            h.fatcaModalVisible = false;
            rerender();
          }}>
          <View style={{flex: 1, backgroundColor: DIALOG_BARRIER, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28}}>
            <Pressable
              style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}
              onPress={() => {
                h.fatcaModalVisible = false;
                rerender();
              }}
            />
            <View
              style={{
                alignSelf: 'stretch',
                maxWidth: 560,
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                paddingLeft: 24,
                paddingTop: 28,
                paddingRight: 24,
                paddingBottom: 20,
                alignItems: 'center',
              }}>
              <Text style={{textAlign: 'center', fontSize: 15, fontWeight: '500', color: KycTheme.textPrimary, lineHeight: 15 * 1.45}}>
                Since you have opted "Yes" for FATCA, you are not allowed to continue the process
              </Text>
              <View style={{height: 24}} />
              <Pressable
                onPress={() => {
                  h.fatcaModalVisible = false;
                  rerender();
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  backgroundColor: KycTheme.buttonEnabledPurple,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <MaterialIcon name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* DDPI / SEBI circular */}
        <Modal
          visible={h.ddpiModalVisible}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            h.ddpiModalVisible = false;
            rerender();
          }}>
          <View style={{flex: 1, backgroundColor: DIALOG_BARRIER, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24}}>
            <Pressable
              style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}
              onPress={() => {
                h.ddpiModalVisible = false;
                rerender();
              }}
            />
            <View
              style={{
                alignSelf: 'stretch',
                maxWidth: 560,
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                paddingLeft: 20,
                paddingTop: 24,
                paddingRight: 20,
                paddingBottom: 16,
                alignItems: 'stretch',
              }}>
              <ScrollView style={{maxHeight: windowHeight * 0.7, flexGrow: 0}}>
                <View style={{alignItems: 'flex-start'}}>
                  <Text style={{fontSize: 14, fontWeight: '700', color: KycTheme.textPrimary, lineHeight: 14 * 1.45}}>
                    As per SEBI circular No's: SEBI/HO/MIRSD/DoP/CIR/2022/44 Dated April 04, 2022
                  </Text>
                  <View style={{height: 12}} />
                  <Text style={dialogBodyStyle}>
                    The use of DDPI (Demat Debit & Pledge Instruction) will be limited only for below four purposes to authorize BP
                    Equities Pvt. Ltd. to access your Demat account only to meet:
                  </Text>
                  <View style={{height: 12}} />
                  <Text style={dialogBodyStyle}>1. Pay-in obligations for settlement or deliveries of trades executed by you.</Text>
                  <View style={{height: 8}} />
                  <Text style={dialogBodyStyle}>2. To pledge/re-pledge securities to avail margin on trades.</Text>
                  <View style={{height: 8}} />
                  <Text style={dialogBodyStyle}>
                    3. Mutual Fund Transactions being executed on Stock Exchanges order entry platforms.
                  </Text>
                  <View style={{height: 8}} />
                  <Text style={dialogBodyStyle}>4. Tendering shares in open offers through Stock Exchanges platforms.</Text>
                  <View style={{height: 12}} />
                  <Text style={dialogBodyStyle}>
                    In case any changes are required to the above purposes, kindly proceed with the offline account opening process.
                  </Text>
                  <View style={{height: 12}} />
                  <Text style={dialogBodyStyle}>
                    <Text style={{fontWeight: '700'}}>Note: </Text>
                    <Text>One-time charge of ₹100/- (excluding GST) will be debited from your trading ledger account to enable DDPI</Text>
                  </Text>
                </View>
              </ScrollView>
              <View style={{height: 16}} />
              <View style={{alignItems: 'center'}}>
                <ElevatedButton
                  paddingHorizontal={40}
                  paddingVertical={12}
                  borderRadius={8}
                  label="OK"
                  labelStyle={{fontSize: 15, fontWeight: '600'}}
                  backgroundColor={KycTheme.buttonEnabledPurple}
                  onPress={() => {
                    h.ddpiModalVisible = false;
                    rerender();
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* Nominee opt-out declaration */}
        <OptOutDeclarationDialog
          visible={h.optOutDeclarationVisible}
          onClose={() => {
            h.optOutDeclarationVisible = false;
            rerender();
          }}
        />

        {/* Brokerage plan (segments step) */}
        <BrokeragePlanDialog
          visible={h.brokeragePlanDialogVisible}
          onDismiss={() => {
            h.brokeragePlanDialogVisible = false;
            rerender();
          }}
          onDone={() => {
            // Only after user taps Done in the dialog
            formNotifier.handleChange('brokerage_plan', 'Brokerage Plan');
            setState(() => {
              h.segmentsBrokerageUserConfirmed = true;
            });
            Fluttertoast.showToast({msg: 'Brokerage plan applied', gravity: 'TOP'});
          }}
        />

        {/* Penny drop save / retake */}
        <AlertDialogView
          visible={h.pennyDialog != null}
          title={h.pennyDialog?.title}
          backgroundColor="#FFFFFF"
          contentGap={20}
          actionsGap={8}
          barrierDismissible
          onRequestClose={() => h.pennyDialog?.resolve(null)}
          actions={
            <>
              <TextButton
                onPress={h.pennyDialog?.isVerifiedSuccess ? null : () => h.pennyDialog?.resolve('retake')}
                label="Modify"
              />
              <View style={{width: 8}} />
              <ElevatedButton
                borderRadius={20}
                paddingHorizontal={24}
                paddingVertical={10}
                labelStyle={{fontSize: 14, fontWeight: '500'}}
                label="Proceed"
                onPress={() => h.pennyDialog?.resolve('save')}
              />
            </>
          }>
          <ScrollView style={{maxHeight: windowHeight * 0.5}}>
            <Text style={{fontSize: 14, lineHeight: 21, color: KycTheme.textPrimary, textAlign: 'left'}}>
              {h.pennyDialog?.message ?? ''}
            </Text>
          </ScrollView>
        </AlertDialogView>

        {/* Terms & Conditions bottom sheet */}
        <Modal
          visible={h.termsModalVisible}
          transparent
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => {
            h.termsModalVisible = false;
            rerender();
          }}>
          <View style={{flex: 1, justifyContent: 'flex-end', backgroundColor: DIALOG_BARRIER}}>
            <Pressable
              style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}
              onPress={() => {
                h.termsModalVisible = false;
                rerender();
              }}
            />
            <View style={{padding: 24, backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16}}>
              <SafeAreaView edges={['bottom']}>
                <View style={{alignItems: 'stretch'}}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Text style={{fontSize: 18, fontWeight: '700', color: '#000000'}}>Terms & Conditions</Text>
                    <IconButton
                      onPress={() => {
                        h.termsModalVisible = false;
                        rerender();
                      }}>
                      <MaterialIcon name="close" size={24} color="#000000" />
                    </IconButton>
                  </View>
                  <View style={{height: 12}} />
                  <Text style={{fontSize: 14, lineHeight: 21, color: '#000000'}}>
                    By signing up, You agree that TRUEWEALTH representative may contact you telephonically in connection with
                    the services or your registration on the platform or to introduce new product/ service offerings.
                  </Text>
                </View>
              </SafeAreaView>
            </View>
          </View>
        </Modal>

        {/* BP Wealth tariff PDF preview (iOS) */}
        <BpWealthTariffPdfPreviewDialog
          visible={h.tariffPdfPreviewVisible}
          onClose={() => {
            h.tariffPdfPreviewVisible = false;
            rerender();
          }}
        />
      </>
    );
  }

  // ---------- Lifecycle ----------

  // initState / dispose
  useEffect(() => {
    h.mounted = true;
    // WidgetsBinding.instance.addPostFrameCallback
    const initTimer = setTimeout(() => {
      h.lastReconnectToken = connectivity.reconnectToken;
      connectivity.addListener(onInternetRestored);
      void loadWorkflow();
    }, 0);
    return () => {
      h.mounted = false;
      clearTimeout(initTimer);
      connectivity.removeListener(onInternetRestored);
      if (h.returnFlowWatchdogTimer != null) clearTimeout(h.returnFlowWatchdogTimer);
      if (h.returnFlowPollingTimer != null) clearInterval(h.returnFlowPollingTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FutureBuilder<bool>(future: StorageService.hasAccessToken()) – re-queried on every rebuild.
  useEffect(() => {
    let cancelled = false;
    void StorageService.hasAccessToken().then(v => {
      if (cancelled || !h.mounted) return;
      if (h.isAuthenticated !== v) {
        h.isAuthenticated = v;
        rerender();
      }
    });
    return () => {
      cancelled = true;
    };
  });

  // Flush post-frame callbacks queued during this render.
  useEffect(() => {
    const cbs = postFrame.splice(0, postFrame.length);
    for (const cb of cbs) cb();
  });

  return (
    <View
      style={{flex: 1}}
      onTouchStart={(e: any) => {
        handleTapOutsideForDateInputs(e.nativeEvent.target);
      }}>
      {renderScreen()}
      {renderOverlays()}
    </View>
  );
}
