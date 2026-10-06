import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import type {
  FileDownloadEvent,
  ShouldStartLoadRequest,
  ShouldStartLoadRequestEvent,
  WebViewErrorEvent,
  WebViewMessageEvent,
  WebViewNavigationEvent,
  WebViewOpenWindowEvent,
} from 'react-native-webview/lib/WebViewTypes';
import CookieManager from '@react-native-cookies/cookies';
import {
  DocumentDirectoryPath,
  downloadFile,
  exists,
  mkdir,
  writeFile,
} from '@dr.pogodin/react-native-fs';
import {PERMISSIONS, RESULTS, requestMultiple} from 'react-native-permissions';
import {KycAPI} from '../api/kycApi';
import {ElevatedButton} from '../components/MaterialButtons';
import {MaterialIcon} from '../components/MaterialIcon';
import {goTo} from '../navigation/router';
import {useConnectivityRead} from '../services/connectivityController';
import {StorageService} from '../services/storageService';
import {useAppStoreRead} from '../store/appStore';
import {KycTheme} from '../theme/kycTheme';
import {delay, toStr} from '../utils/dartHelpers';
import {debugPrint} from '../utils/debug';
import {encodeComponent, uriTryParse} from '../utils/dartUri';
import {Fluttertoast} from '../utils/toast';
import {WebViewController, WebViewHandle} from './webViewController';
import {
  ACCOUNT_AGGREGATOR_KEYBOARD_ASSIST_JS,
  ACCOUNT_AGGREGATOR_VIEWPORT_FIX_JS,
  DIGILOCKER_FREEZE_JS,
  ESIGN_BLOB_DOWNLOAD_HOOK_JS,
  ESIGN_DOWNLOAD_GESTURE_TRACKER_JS,
  MAIN_FRAME_BODY_TEXT_JS,
  NO_AUTO_SCROLL_JS,
  POPUP_CLOSE_HOOK_JS,
  READ_BLOB_BYTES_BODY_JS,
  RESET_ESIGN_GESTURE_JS,
  RPD_CONSOLE_SIGNING_RELOAD_JS,
  RPD_TIMER_OVERRIDE_JS,
} from './webViewScripts';
import {
  extractIntentPackage,
  isPaymentDeepLink,
  kGooglePayPackage,
  launchIntentUrlNative,
  launchPaymentUriNative,
  packageForPaymentUri,
  parseAndroidPaymentIntentUrl,
  paymentLog,
  sanitizeDownloadFilename,
  shouldHandleExternally,
  wvLog,
} from './webViewHelpers';

const kMaxReversePennyPollAttempts = 18; // ~90 seconds @ 5s interval
const kMaxCloudesignAutoReloadAttempts = 3;
const kMaxAaJsonErrorAutoReloadAttempts = 2;
const kDefaultLoadTimeoutMs = 25000;
const kEsignLoadTimeoutMs = 45000;

interface Props {
  url: string;
  title?: string;
  company: string;
  workflowName: string;
}

type Timer = ReturnType<typeof setTimeout> | null;

function createFields(url: string) {
  const initialUri = uriTryParse(url);
  return {
    mounted: true,
    isLoading: true,
    currentUrl: url,
    preservedState: (initialUri?.queryParameters.state ?? null) as string | null,
    preservedClientToken: (initialUri?.queryParameters.client_token ?? null) as string | null,
    preservedAuto: (initialUri?.queryParameters.auto ?? null) as string | null,
    hasSeenCleanUrl: false,
    permissionsRequested: false,
    hasReloadedAfterPermissions: false,
    pendingReloadAfterPermissions: false,
    permissionRequestScheduled: false,
    permissionHandlerInFlight: false,
    ipvPermissionGateActive: false,
    redirectHandled: false,
    /** Set as soon as IPV success URL is seen — blocks website paint before API finishes. */
    ipvSuccessHandoff: false,
    /** One silent reload if Face/IPV main-frame fails once (permission/reload race). */
    ipvLoadErrorAutoRetryCount: 0,
    /** Params captured from completion/success URLs (e.g. success=yes, transaction_id=...). */
    completionParams: {} as Record<string, string>,
    // Popup window (Digio etc.) for reverse_pennydrop
    popupUrl: null as string | null,
    popupOpen: false,
    // Track if a UPI app was opened so we can auto-refresh on return
    upiAppLaunched: false,
    lastPaymentTargetPackage: null as string | null,
    lastPaymentAttemptAt: null as number | null,
    lastReconnectToken: 0,
    // Track if any payment app was launched (for iOS auto-reload)
    paymentAppLaunched: false,
    reversePennyPollTimer: null as ReturnType<typeof setInterval> | null,
    // --- Loading / error UX state ---
    hasError: false,
    errorMessage: 'Something went wrong, please try again.',
    loadingMessage: 'Loading...',
    initialPageLoaded: false,
    loadTimeoutTimer: null as Timer,
    slowNetworkTimer: null as Timer,
    loadHintTimer2: null as Timer,
    reversePennyPollAttempts: 0,
    esignScrollAdjusted: false,
    rpdSuccessHandled: false,
    rpdBackLoading: false,
    rpdSigningCompletedReloadTriggered: false,
    rpdSigningSessionFlagReset: false,
    lastKeyboardBottomInset: 0,
    cloudesignAutoReloadAttempts: 0,
    cloudesignRecoveryTimer: null as Timer,
    cloudesignRecoveryPending: false,
    cloudesignRecoveryUrl: null as string | null,
    esignPdfDownloadInProgress: false,
    cloudesignInterruptRecoveryUsed: false,
    aaJsonErrorAutoReloadAttempts: 0,
    aaJsonErrorAutoReloadUrl: null as string | null,
    lastEsignPdfDownloadEventAt: null as number | null,
    /** Mirror of window.__meonUserGestureForDownload (sync reads in navigation callbacks). */
    gesture: false,
    /** Snack bar (ScaffoldMessenger) state. */
    snack: null as null | {message: string; isError: boolean},
    snackTimer: null as Timer,
    /** WebView remount key + optional explicit load target (Try Again `loadUrl`). */
    webKey: 0,
    loadTarget: null as string | null,
    keyboardVisible: false,
  };
}

/**
 * WebView page for external redirects (DigiLocker, IPV/Face Finder).
 * Port of lib/pages/webview_page.dart (react-native-webview instead of flutter_inappwebview).
 */
export function WebViewPage(props: Props) {
  const title = props.title ?? 'External Verification';
  const insets = useSafeAreaInsets();
  const store = useAppStoreRead();
  const connectivity = useConnectivityRead();
  const [f] = useState(() => createFields(props.url));
  const [, setTick] = useState(0);
  const rerender = () => {
    if (f.mounted) setTick(t => t + 1);
  };

  const webRef = useRef<WebViewHandle | null>(null);
  const popupWebRef = useRef<WebViewHandle | null>(null);
  const [ctrl] = useState(() => new WebViewController());
  const [popupCtrl] = useState(() => new WebViewController());
  ctrl.bind(webRef);
  popupCtrl.bind(popupWebRef);

  // ---------------------------------------------------------------------------
  // URL / flow predicates
  // ---------------------------------------------------------------------------

  /** eSign / PDF (pdf.js) pages often need more time than a normal HTML page. */
  function isEsignPdfHeavyUrl(url: string): boolean {
    const u = url.toLowerCase();
    return (
      u.includes('cloudesign') ||
      u.includes('esign.meon') ||
      u.includes('esignservices') ||
      u.includes('/esign/') ||
      u.includes('proteantech') ||
      u.includes('pdf.js') ||
      u.includes('cdnjs.cloudflare.com/ajax/libs/pdf.js')
    );
  }

  const isBlobDownloadUrl = (url: string): boolean => url.toLowerCase().startsWith('blob:');

  function isCloudesignDocumentUrl(url: string): boolean {
    const uri = uriTryParse(url);
    if (uri == null) return false;
    const host = uri.host.toLowerCase();
    const path = uri.path.toLowerCase();
    return (
      (host.includes('meon.co.in') || host.includes('stoxbox.in')) &&
      path.includes('/cloudesign/document-')
    );
  }

  /**
   * eSign HTML app (`esign.meon.co.in/EsignServices/...`) — loads via JS after
   * `onLoadStop`. Never auto-reload; user interacts on the live page.
   */
  function isEsignServiceSpaUrl(url: string): boolean {
    const u = url.toLowerCase();
    return (
      u.includes('esign.meon.co.in') && (u.includes('/esignservices/') || u.includes('/esign/'))
    );
  }

  /**
   * In-app auto-retry only for cloudesign **document** PDF pages (blank first paint).
   * eSign service SPAs and other heavy URLs must not reload after a successful load.
   */
  function usesInAppDocumentAutoRetry(url: string): boolean {
    if (isEsignServiceSpaUrl(url)) return false;
    return isCloudesignDocumentUrl(url);
  }

  function cancelCloudesignRecovery(): void {
    if (f.cloudesignRecoveryTimer != null) clearTimeout(f.cloudesignRecoveryTimer);
    f.cloudesignRecoveryTimer = null;
  }

  function resetDocumentRetryState(): void {
    f.cloudesignAutoReloadAttempts = 0;
    f.cloudesignRecoveryPending = false;
    f.cloudesignRecoveryUrl = null;
    cancelCloudesignRecovery();
  }

  function showInAppDocumentRetryAfterFailedRecovery(): void {
    cancelCloudesignRecovery();
    if (!f.mounted || f.redirectHandled) return;
    debugPrint(
      `[WebView] Document still not loaded after ${kMaxCloudesignAutoReloadAttempts} in-app retries — showing retry UI`,
    );
    f.isLoading = false;
    f.hasError = true;
    f.errorMessage =
      'We could not load the document after several tries. Please check your connection and tap Try Again to reload inside the app.';
    f.loadingMessage = 'Loading...';
    rerender();
  }

  const activeWebViewUrl = (): string => (f.currentUrl.length > 0 ? f.currentUrl : props.url);

  function isIpvOrFaceFinderUrl(url: string): boolean {
    const uri = uriTryParse(url);
    if (uri == null) return false;
    const host = uri.host.toLowerCase();
    const path = uri.path.toLowerCase();
    // Hosts like face-finder.meon.co.in put "face" in the host, not the path.
    return (
      host.includes('ipv.meon.co.in') ||
      host.includes('ipv.stoxbox.in') ||
      host.includes('ipv') ||
      host.includes('face') ||
      host.includes('face-finder') ||
      host.includes('facefinder') ||
      path.includes('ipv') ||
      path.includes('face') ||
      path.includes('facefinder')
    );
  }

  /** DigiLocker OAuth / Aadhaar–PIN pages (digitallocker.gov.in, digilocker.*). */
  function isDigilockerUrl(url: string): boolean {
    const uri = uriTryParse(url);
    if (uri == null) return false;
    const host = uri.host.toLowerCase();
    return host.includes('digilocker') || host.includes('digitallocker');
  }

  /** Account Aggregator / CAMS linked-account OTP pages. */
  function isAccountAggregatorUrl(url: string): boolean {
    const uri = uriTryParse(url);
    if (uri == null) return false;
    const host = uri.host.toLowerCase();
    const path = uri.path.toLowerCase();
    const query = uri.query.toLowerCase();
    if (host.includes('camsfinserv') || host.includes('standardjourney.camsfinserv.com')) {
      return true;
    }
    if (path.includes('account_aggregator') || query.includes('account_aggregator')) {
      return true;
    }
    return false;
  }

  const isAccountAggregatorFlow = (): boolean =>
    title.toLowerCase().includes('account aggregator') ||
    isAccountAggregatorUrl(props.url) ||
    isAccountAggregatorUrl(activeWebViewUrl());

  /** True only for the DigiLocker KYC step (title + live URL). */
  function isDigilockerFlow(url?: string | null): boolean {
    if (title.toLowerCase().includes('digilocker')) return true;
    const sample = url ?? activeWebViewUrl();
    return isDigilockerUrl(sample);
  }

  function isReversePennyDropUrl(url: string): boolean {
    const lower = url.toLowerCase();
    if (
      lower.includes('meon_reverse_pennydrop') ||
      lower.includes('reversepennydrop') ||
      lower.includes('rpd.meon')
    ) {
      return true;
    }
    const uri = uriTryParse(url);
    if (uri == null) return false;
    const host = uri.host.toLowerCase();
    const path = uri.path.toLowerCase();
    const query = uri.query.toLowerCase();
    return (
      (host.includes('meon.co.in') || host.includes('stoxbox.in') || host.includes('digio.in')) &&
      (path.includes('reverse_pennydrop') ||
        path.includes('reversepennydrop') ||
        query.includes('reverse_pennydrop') ||
        query.includes('reversepennydrop'))
    );
  }

  /**
   * True for any Digio gateway page that hosts the UPI/RPD UI inside a popup
   * (e.g. https://app.digio.in/#/gateway/login/...). This is where the visible
   * 5-minute countdown timer is rendered.
   */
  function isDigioGatewayUrl(url: string): boolean {
    const uri = uriTryParse(url);
    if (uri == null) return false;
    const host = uri.host.toLowerCase();
    if (!host.includes('digio.in')) return false;
    const fragment = uri.fragment.toLowerCase();
    const path = uri.path.toLowerCase();
    return path.includes('/gateway/') || fragment.includes('/gateway/');
  }

  const isReversePennyDropFlow = (): boolean =>
    isReversePennyDropUrl(props.url) || isReversePennyDropUrl(f.currentUrl);

  /** Digio eSign flow – hosted on our domain under /digio/cloud-esign/... */
  function isDigioEsignUrl(url: string): boolean {
    const uri = uriTryParse(url);
    if (uri == null) return false;
    const host = uri.host.toLowerCase();
    const path = uri.path.toLowerCase();
    return (
      (host.includes('meon.co.in') || host.includes('stoxbox.in')) &&
      path.includes('/digio/cloud-esign/')
    );
  }

  const isDigioEsignFlow = (): boolean => isDigioEsignUrl(props.url) || isDigioEsignUrl(f.currentUrl);

  /** Flows that need JS window.open popups (Digio bank selection etc.) */
  const supportsPopupWindows = (): boolean => isReversePennyDropFlow() || isDigioEsignFlow();

  /** IPV/FaceFinder flow camera/WebRTC ke liye popup/multiple windows off rakhna safe rahega. */
  const enablePopupWindows = (): boolean => supportsPopupWindows() && !isIpvOrFaceFinderUrl(props.url);

  function isProceedToEsignFlowContext(url?: string | null): boolean {
    const sample = (url ?? f.currentUrl).toLowerCase();
    if (isEsignPdfHeavyUrl(sample) || isCloudesignDocumentUrl(sample)) {
      return true;
    }
    return title.toLowerCase().includes('esign');
  }

  function looksLikePdfFileNavigation(url: string): boolean {
    const lower = url.toLowerCase();
    if (lower.endsWith('.pdf')) return true;
    if (lower.includes('application/pdf')) return true;
    if (lower.includes('content-disposition=attachment') && lower.includes('pdf')) {
      return true;
    }
    return false;
  }

  /** iOS form fields under keyboard: Proceed to eSign Aadhaar only. */
  function needsIosKeyboardFieldAssist(url?: string | null): boolean {
    if (Platform.OS !== 'ios') return false;
    if (isDigilockerFlow(url)) return false;
    // AA/CAMS: do not inject scroll assist — breaks "Link accounts" OTP sheet layout.
    if (isAccountAggregatorFlow()) return false;
    const sample = url ?? activeWebViewUrl();
    if (
      isProceedToEsignFlowContext(sample) ||
      isDigioEsignUrl(sample) ||
      isEsignServiceSpaUrl(sample) ||
      title.toLowerCase().includes('esign')
    ) {
      return true;
    }
    return false;
  }

  /**
   * On iOS, disabling `scrollIntoView` breaks OTP on CAMS/Digio; enable only where
   * auto-scroll-on-focus causes visible jank (IPV/Face).
   */
  function shouldInjectNoAutoScrollJs(url: string | null | undefined): boolean {
    if (url == null || url.length === 0) return Platform.OS !== 'ios';
    if (Platform.OS !== 'ios') return true;
    if (isDigilockerFlow(url)) return false;
    return isIpvOrFaceFinderUrl(url);
  }

  /** iOS scaffold resize: DigiLocker + Account Aggregator keep fixed WebView height. */
  function shouldResizeForKeyboard(): boolean {
    if (Platform.OS !== 'ios') return false;
    if (isDigilockerFlow()) return false;
    if (isAccountAggregatorFlow()) return false;
    return true;
  }

  /** True when [path] is our `/{company}/{workflow}` (case-insensitive). */
  function isOurWorkflowPath(path: string): boolean {
    const needle = `/${props.company}/${props.workflowName}`.toLowerCase();
    return path.toLowerCase().includes(needle);
  }

  /**
   * IPV/Face return to our workflow URL (`?success=yes` and/or `state=`),
   * OR Face Finder / IPV host itself reporting `success=yes`.
   */
  function isIpvOrFaceSuccessReturnUrl(url: string): boolean {
    const uri = uriTryParse(url);
    if (uri == null) return false;
    const host = uri.host.toLowerCase();
    const path = uri.path.toLowerCase();
    const hasSuccess = uri.queryParameters.success?.toLowerCase() === 'yes';
    const hasState = 'state' in uri.queryParameters;
    if (!hasSuccess && !hasState) return false;

    // face-finder.meon.co.in/?hash=...&success=yes — close immediately.
    if (hasSuccess && isIpvOrFaceFinderUrl(url)) {
      return true;
    }

    const isWorkflowPath = isOurWorkflowPath(path);
    const isOurFrontend =
      (host.includes('meon.co.in') || host.includes('stoxbox.in')) &&
      !host.includes('ipv.') &&
      !host.includes('api.') &&
      !host.includes('digilocker.') &&
      !host.includes('face');
    return isOurFrontend && isWorkflowPath;
  }

  // ---------------------------------------------------------------------------
  // Initial user scripts (injected at document start, main frame only)
  // ---------------------------------------------------------------------------
  function initialUserScript(): string | undefined {
    if (isDigilockerFlow(props.url)) return DIGILOCKER_FREEZE_JS;
    const isAaFromStart =
      title.toLowerCase().includes('account aggregator') || isAccountAggregatorUrl(props.url);
    if (isAaFromStart) return ACCOUNT_AGGREGATOR_VIEWPORT_FIX_JS;
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Error / ignore rules
  // ---------------------------------------------------------------------------

  /**
   * Benign load errors (blob PDF save, cancelled reloads, etc.). Cloudesign document
   * URLs are handled via the navigation callbacks + optional reload — not silently ignored.
   */
  function shouldIgnoreWebViewLoadError(
    url: string,
    opts: {code?: number | null; description?: string | null},
  ): boolean {
    const u = url.toLowerCase();
    if (u.startsWith('blob:')) return true;
    if (isCloudesignDocumentUrl(url)) return false;
    // iOS NSURLErrorCancelled / interrupted navigations (permission dialog, reload).
    if (opts.code === -999 || opts.code === 102) return true;
    const d = (opts.description ?? '').toLowerCase();
    if (d.includes('frame load interrupted')) return true;
    if (d.includes('cancelled') || d.includes('canceled')) return true;
    if (d.includes('aborted')) return true;
    if (d.includes('operation canceled') || d.includes('operation cancelled')) {
      return true;
    }
    return false;
  }

  /**
   * True when Face/IPV permission UI or post-grant reload is mid-flight.
   * Load cancels here are not real connectivity failures.
   */
  function isIpvPermissionLoadTransient(): boolean {
    if (!isIpvOrFaceFinderUrl(activeWebViewUrl()) && !title.toLowerCase().includes('face')) {
      return false;
    }
    return (
      f.ipvPermissionGateActive ||
      f.permissionHandlerInFlight ||
      f.permissionRequestScheduled ||
      (f.permissionsRequested && !f.hasReloadedAfterPermissions)
    );
  }

  /**
   * Main-frame only — IPV pages load many camera/CDN subresources that must not
   * trigger the full-screen "check your connection" overlay.
   */
  function isMainFrameErrorUrl(errorUrl: string): boolean {
    if (errorUrl.length === 0) return true;
    const current = f.currentUrl.length > 0 ? f.currentUrl : props.url;
    if (errorUrl === current) return true;
    try {
      const a = uriTryParse(errorUrl);
      const b = uriTryParse(current);
      if (a == null || b == null) return false;
      if (a.host.length === 0 || b.host.length === 0) return false;
      return a.host.toLowerCase() === b.host.toLowerCase() && a.path === b.path;
    } catch (_) {
      return false;
    }
  }

  /** Surfaces a load failure only for real main-frame problems (not IPV noise). */
  function surfaceWebViewLoadFailure(opts: {
    errorUrl: string;
    code?: number | null;
    description?: string | null;
  }): void {
    const {errorUrl, code, description} = opts;
    if (shouldIgnoreWebViewLoadError(errorUrl, {code, description})) {
      debugPrint(`[WebView] Ignoring benign load error (${code}): ${description}, url=${errorUrl}`);
      return;
    }
    if (errorUrl.length > 0 && !isMainFrameErrorUrl(errorUrl)) {
      debugPrint(`[WebView] Ignoring non-main-frame load error (${code}): ${errorUrl}`);
      return;
    }
    if (isIpvPermissionLoadTransient()) {
      debugPrint(`[WebView] Ignoring IPV permission/reload transient error (${code}): ${description}`);
      return;
    }
    if (f.redirectHandled || f.ipvSuccessHandoff) return;

    const isFaceStep =
      isIpvOrFaceFinderUrl(activeWebViewUrl()) || title.toLowerCase().includes('face');
    if (isFaceStep && f.ipvLoadErrorAutoRetryCount < 1) {
      f.ipvLoadErrorAutoRetryCount++;
      debugPrint(`[WebView] Face/IPV load error — silent auto-retry (${f.ipvLoadErrorAutoRetryCount})`);
      if (f.mounted) {
        f.isLoading = true;
        f.hasError = false;
        f.loadingMessage = 'Loading...';
        rerender();
      }
      startLoadTimers({url: activeWebViewUrl()});
      setTimeout(() => {
        if (!f.mounted || f.redirectHandled) return;
        ctrl.reload();
      }, 400);
      return;
    }

    cancelLoadTimers();
    if (!f.mounted) return;
    const looksNetwork = (() => {
      const d = (description ?? '').toLowerCase();
      return (
        code === -2 || // HOST_LOOKUP
        code === -6 || // CONNECT
        code === -8 || // TIMEOUT
        d.includes('host_lookup') ||
        d.includes('err_internet') ||
        d.includes('err_name_not_resolved') ||
        d.includes('err_connection') ||
        d.includes('network')
      );
    })();
    f.isLoading = false;
    f.hasError = true;
    f.errorMessage = looksNetwork
      ? 'Failed to load page. Please check your connection and try again.'
      : 'Failed to load this page. Tap Try Again to reload.';
    rerender();
  }

  function isCloudesignLoadInterruptError(opts: {
    url: string;
    code?: number | null;
    description?: string | null;
  }): boolean {
    if (!isCloudesignDocumentUrl(opts.url)) return false;
    const d = (opts.description ?? '').toLowerCase();
    return opts.code === 102 || d.includes('frame load interrupted');
  }

  // ---------------------------------------------------------------------------
  // eSign PDF download
  // ---------------------------------------------------------------------------

  async function resetEsignDownloadUserGesture(c: WebViewController): Promise<void> {
    f.gesture = false;
    try {
      c.inject(RESET_ESIGN_GESTURE_JS);
    } catch (_) {}
  }

  async function injectEsignDownloadUserGestureTracker(c: WebViewController): Promise<void> {
    try {
      c.inject(ESIGN_DOWNLOAD_GESTURE_TRACKER_JS);
      // RN-only: blob download interception + gesture mirror (see webViewScripts.ts)
      c.inject(ESIGN_BLOB_DOWNLOAD_HOOK_JS);
    } catch (e) {
      debugPrint(`[WebView] Error injecting eSign download gesture tracker: ${e}`);
    }
  }

  async function hasEsignDownloadUserGesture(c: WebViewController): Promise<boolean> {
    try {
      const result = await c.evaluate('window.__meonUserGestureForDownload === true');
      const v = typeof result === 'boolean' ? result : String(result ?? '').toLowerCase() === 'true';
      f.gesture = v;
      return v;
    } catch (e) {
      debugPrint(`[WebView] Error reading eSign download gesture flag: ${e}`);
      return false;
    }
  }

  function filenameFromDownloadUrl(url: string): string {
    if (url.toLowerCase().startsWith('blob:')) {
      return 'kyc_esign_document.pdf';
    }
    const uri = uriTryParse(url);
    if (uri == null || !uri.hasScheme || uri.host.length === 0) {
      return 'kyc_esign_document.pdf';
    }
    const segments = uri.pathSegments.filter(s => s.length > 0);
    if (segments.length === 0) return 'kyc_esign_document.pdf';
    const last = segments[segments.length - 1];
    if (last.toLowerCase().endsWith('.pdf')) {
      return sanitizeDownloadFilename(last);
    }
    return 'kyc_esign_document.pdf';
  }

  /**
   * pdf.js on eSign uses in-memory `blob:https://...` URLs. Those only exist inside this
   * WebView — never fetch them from native. Read bytes in-page (base64).
   */
  async function readBlobUrlBytesInWebView(c: WebViewController, blobUrl: string): Promise<string> {
    const result = await c.evaluateAsync(READ_BLOB_BYTES_BODY_JS, 'blobUrl', blobUrl);
    if (result == null) {
      throw new Error('WebView did not return blob bytes');
    }
    const value = result;
    if (value == null || String(value).length === 0) {
      throw new Error('Empty blob bytes from WebView');
    }
    return String(value);
  }

  function showEsignDownloadMessage(
    message: string,
    opts: {isError?: boolean; clearPrevious?: boolean} = {},
  ): void {
    const isError = opts.isError ?? false;
    if (!f.mounted) return;
    if (f.snackTimer != null) clearTimeout(f.snackTimer);
    f.snack = {message, isError};
    rerender();
    f.snackTimer = setTimeout(
      () => {
        f.snack = null;
        f.snackTimer = null;
        rerender();
      },
      (isError ? 4 : 10) * 1000,
    );
    // Short toast as backup (no gravity — avoids Android text-toast issues).
    const summary = message.split('\n')[0].trim();
    if (summary.length > 0) {
      Fluttertoast.cancel();
      Fluttertoast.showToast({msg: summary, long: true});
    }
  }

  async function handleEsignPdfDownload(
    c: WebViewController,
    opts: {
      downloadUrl: string;
      suggestedFilename?: string | null;
      userAgent?: string | null;
      mimeType?: string | null;
      skipGestureCheck?: boolean;
      /** RN-only: bytes already read in-page by the blob hook. */
      prefetchedBase64?: string | null;
    },
  ): Promise<void> {
    if (!f.mounted) return;
    if (!isProceedToEsignFlowContext()) {
      debugPrint('[WebView] Ignoring download outside eSign/PDF context');
      return;
    }
    if (f.esignPdfDownloadInProgress) return;

    if (!(opts.skipGestureCheck ?? false)) {
      const allowed = await hasEsignDownloadUserGesture(c);
      if (!allowed) {
        debugPrint('[WebView] Blocked PDF download without user tap (auto-download prevented)');
        return;
      }
    }

    const now = Date.now();
    if (f.lastEsignPdfDownloadEventAt != null && now - f.lastEsignPdfDownloadEventAt < 3000) {
      debugPrint('[WebView] Ignoring duplicate PDF download event');
      return;
    }
    f.lastEsignPdfDownloadEventAt = now;

    f.esignPdfDownloadInProgress = true;
    try {
      let filename = opts.suggestedFilename?.trim();
      if (filename == null || filename.length === 0) {
        filename = filenameFromDownloadUrl(opts.downloadUrl);
      }
      filename = sanitizeDownloadFilename(filename);
      const mime = opts.mimeType?.toLowerCase() ?? '';
      if (!filename.toLowerCase().endsWith('.pdf') && mime.includes('pdf')) {
        filename = `${filename}.pdf`;
      }

      const downloadsDir = `${DocumentDirectoryPath}/esign_downloads`;
      if (!(await exists(downloadsDir))) {
        await mkdir(downloadsDir);
      }

      let savePath = `${downloadsDir}/${filename}`;
      if (await exists(savePath)) {
        const stamp = Date.now();
        savePath = `${downloadsDir}/${stamp}_${filename}`;
      }

      const urlStr = opts.downloadUrl;
      if (urlStr.toLowerCase().startsWith('blob:')) {
        debugPrint('[WebView] Saving PDF from in-WebView blob (not an HTTP download URL)');
        const b64 =
          opts.prefetchedBase64 != null && opts.prefetchedBase64.length > 0
            ? opts.prefetchedBase64
            : await readBlobUrlBytesInWebView(c, urlStr);
        if (b64.length === 0) {
          throw new Error('Downloaded PDF is empty');
        }
        await writeFile(savePath, b64, 'base64');
      } else {
        const httpUri = uriTryParse(urlStr);
        if (httpUri == null || !httpUri.hasScheme || httpUri.host.length === 0) {
          throw new Error('Invalid download URL');
        }
        const cookies = await CookieManager.get(f.currentUrl);
        const headers: Record<string, string> = {};
        if (opts.userAgent != null && opts.userAgent.trim().length > 0) {
          headers['User-Agent'] = opts.userAgent;
        }
        const cookieNames = Object.keys(cookies);
        if (cookieNames.length > 0) {
          headers.Cookie = cookieNames.map(n => `${n}=${cookies[n].value}`).join('; ');
        }
        const res = await downloadFile({fromUrl: urlStr, toFile: savePath, headers}).promise;
        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error(`HTTP ${res.statusCode}`);
        }
      }

      debugPrint(`[WebView] eSign PDF saved: ${savePath}`);
      const savedName = savePath.split('/').pop() ?? filename;
      showEsignDownloadMessage(`PDF downloaded successfully\n${savedName}\n${savePath}`);
    } catch (e) {
      debugPrint(`[WebView] eSign PDF download failed: ${e}`);
      showEsignDownloadMessage('Download failed. Please try again.', {isError: true});
    } finally {
      f.esignPdfDownloadInProgress = false;
      // Keep the eSign page visible — blob navigation must not leave a loader up.
      if (f.mounted && f.initialPageLoaded && !f.redirectHandled) {
        f.isLoading = false;
        f.hasError = false;
        rerender();
      }
    }
  }

  /**
   * WebView signals a download (iOS `onFileDownload`; blob messages from the in-page hook).
   * Runs only for explicit user downloads (gesture) or blob/pdf.js.
   */
  async function onDownloadStartRequest(
    c: WebViewController,
    urlStr: string,
    extra: {suggestedFilename?: string | null; mimeType?: string | null; prefetchedBase64?: string | null} = {},
  ): Promise<void> {
    if (urlStr.length === 0) return;

    // Cloudesign page load: native may still emit this event — do not save or interrupt.
    if (isCloudesignDocumentUrl(urlStr) && !(await hasEsignDownloadUserGesture(c))) {
      return;
    }

    debugPrint(`[WebView] onDownloadStartRequest: ${urlStr}`);
    if (!isProceedToEsignFlowContext()) return;
    // Blob save handled in shouldOverrideUrlLoading (navigation cancelled).
    if (isBlobDownloadUrl(urlStr) && f.esignPdfDownloadInProgress) {
      return;
    }
    const isIosBlobDownload =
      Platform.OS === 'ios' && urlStr.toLowerCase().startsWith('blob:') && f.initialPageLoaded;

    if (!isIosBlobDownload && !(await hasEsignDownloadUserGesture(c))) {
      debugPrint('[WebView] Ignoring download start (no user tap yet)');
      return;
    }

    await handleEsignPdfDownload(c, {
      downloadUrl: urlStr,
      suggestedFilename: extra.suggestedFilename,
      mimeType: extra.mimeType,
      skipGestureCheck: isIosBlobDownload,
      prefetchedBase64: extra.prefetchedBase64,
    });
  }

  /** Visible document text — used to detect transient JSON bridge pages before PDF/eSign is ready. */
  async function readMainFrameBodyText(c: WebViewController): Promise<string> {
    try {
      const result = await c.evaluate(MAIN_FRAME_BODY_TEXT_JS);
      if (result == null) return '';
      if (typeof result === 'string') return result.trim();
      return String(result).trim();
    } catch (e) {
      debugPrint(`[WebView] _readMainFrameBodyText error: ${e}`);
      return '';
    }
  }

  /**
   * Cloudesign / eSign sometimes returns a short JSON error (e.g. Invalid Token) or a
   * Chromium-style "Pretty print" JSON view; auto-reload then loads the real document.
   */
  function isTransientEsignBridgePayload(url: string, bodyText: string): boolean {
    if (!isCloudesignDocumentUrl(url)) return false;
    const t = bodyText.trim().toLowerCase();
    if (t.length === 0 || t.length > 8000) return false;

    const pretty = t.includes('pretty print');
    const hasMsgKey = t.includes('"msg"');
    const hasErrorKey = t.includes('"error"');
    const statusFalse =
      t.includes('"status":false') ||
      t.includes('"status": false') ||
      t.includes('"success":false') ||
      t.includes('"success": false');
    const tokenOrPdf =
      t.includes('invalid token') || t.includes('pdf is not generated') || t.includes('journey status');

    // Some backend JSON errors use `error` instead of `msg` (e.g. Python TypeError).
    // Treat both as transient to avoid showing raw JSON UI.
    if (statusFalse && (hasMsgKey || hasErrorKey)) return true;
    if (pretty && (statusFalse || tokenOrPdf)) return true;
    if (tokenOrPdf && hasMsgKey && t.length < 600) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // Load timers
  // ---------------------------------------------------------------------------

  /** Starts hint timers and a timeout. Call on every `onLoadStart`; cancel on `onLoadStop`. */
  function startLoadTimers(opts: {url?: string | null; resetMessageOnCancel?: boolean} = {}): void {
    cancelLoadTimers({resetLoadingMessage: opts.resetMessageOnCancel ?? true});

    const sample = (opts.url ?? f.currentUrl).toLowerCase();
    const heavy = isEsignPdfHeavyUrl(sample);
    const timeoutMs = heavy ? kEsignLoadTimeoutMs : kDefaultLoadTimeoutMs;

    if (heavy) {
      f.slowNetworkTimer = setTimeout(() => {
        if (!f.mounted || !f.isLoading) return;
        f.loadingMessage = 'Loading document...';
        rerender();
      }, 3000);
      f.loadHintTimer2 = setTimeout(() => {
        if (!f.mounted || !f.isLoading) return;
        f.loadingMessage = 'Still loading, please wait...';
        rerender();
      }, 10000);
    } else {
      f.slowNetworkTimer = setTimeout(() => {
        if (!f.mounted || !f.isLoading) return;
        f.loadingMessage = 'Loading, please wait...';
        rerender();
      }, 5000);
    }

    f.loadTimeoutTimer = setTimeout(() => {
      if (!f.mounted || !f.isLoading || f.hasError) return;
      debugPrint(`[WebView] Load timeout (${timeoutMs / 1000}s) — showing retry UI`);
      f.isLoading = false;
      f.hasError = true;
      f.errorMessage = 'This step is taking longer than usual. Check your network and tap Try Again.';
      f.loadingMessage = 'Loading...';
      rerender();
    }, timeoutMs);
  }

  /** Cancels load timers. Optionally keeps loadingMessage (e.g. before "Rendering document..."). */
  function cancelLoadTimers(opts: {resetLoadingMessage?: boolean} = {}): void {
    const resetLoadingMessage = opts.resetLoadingMessage ?? true;
    if (f.loadTimeoutTimer != null) clearTimeout(f.loadTimeoutTimer);
    f.loadTimeoutTimer = null;
    if (f.slowNetworkTimer != null) clearTimeout(f.slowNetworkTimer);
    f.slowNetworkTimer = null;
    if (f.loadHintTimer2 != null) clearTimeout(f.loadHintTimer2);
    f.loadHintTimer2 = null;
    if (resetLoadingMessage && f.mounted && f.loadingMessage !== 'Loading...') {
      f.loadingMessage = 'Loading...';
      rerender();
    }
  }

  // ---------------------------------------------------------------------------
  // Reverse Penny Drop helpers
  // ---------------------------------------------------------------------------

  async function maybeReloadAfterRpdSigningCompleted(opts: {
    c: WebViewController;
    urlForCheck: string;
  }): Promise<void> {
    if (f.redirectHandled || f.rpdSuccessHandled) return;
    if (f.rpdSigningCompletedReloadTriggered) return;

    // Only check text on the reverse_pennydrop page.
    if (!isReversePennyDropUrl(opts.urlForCheck) && !isReversePennyDropFlow()) {
      return;
    }

    try {
      const result = await opts.c.evaluate(
        'try { var t = (document.body && document.body.innerText) ? document.body.innerText : ""; return t.indexOf("Signing completed successfully.") !== -1; } catch(e) { return false; }',
      );

      const isSignedComplete =
        typeof result === 'boolean' ? result : String(result ?? '').toLowerCase() === 'true';

      if (!isSignedComplete) return;

      f.rpdSigningCompletedReloadTriggered = true;
      debugPrint('[WebView] Detected RPD signing completed text - reloading to proceed');

      // Reload main webview so the URL/params can update and we can close+advance.
      ctrl.reload();
    } catch (e) {
      debugPrint(`[WebView] Error checking RPD signing-complete text: ${e}`);
    }
  }

  async function injectRpdConsoleSigningReload(c: WebViewController): Promise<void> {
    try {
      c.inject(RPD_CONSOLE_SIGNING_RELOAD_JS);
    } catch (e) {
      debugPrint(`[WebView] Error injecting RPD console signing reload JS: ${e}`);
    }
  }

  async function injectRpdTimerOverride(c: WebViewController): Promise<void> {
    try {
      c.inject(RPD_TIMER_OVERRIDE_JS);
    } catch (e) {
      debugPrint(`[WebView] Error injecting RPD timer override JS: ${e}`);
    }
  }

  function startReversePennyPolling(): void {
    if (f.reversePennyPollTimer != null) return;
    f.reversePennyPollAttempts = 0;
    // Poll every 5 seconds to let the page re-evaluate payment status and redirect when ready
    f.reversePennyPollTimer = setInterval(async () => {
      if (!isReversePennyDropFlow() || f.redirectHandled || !f.mounted) {
        if (f.reversePennyPollTimer != null) clearInterval(f.reversePennyPollTimer);
        f.reversePennyPollTimer = null;
        return;
      }

      if (f.reversePennyPollAttempts >= kMaxReversePennyPollAttempts) {
        debugPrint('[WebView] Reverse Penny Drop polling: max attempts reached, stopping');
        if (f.reversePennyPollTimer != null) clearInterval(f.reversePennyPollTimer);
        f.reversePennyPollTimer = null;
        return;
      }
      // Only reload while we're on the reverse_pennydrop page; once we leave it, stop polling.
      if (isReversePennyDropUrl(f.currentUrl)) {
        f.reversePennyPollAttempts++;
        debugPrint(`[WebView] Reverse Penny Drop polling reload: ${f.currentUrl}`);
        // Keep polling silent to avoid toast spam.
        await reloadWebViewInternal({showToast: false});
      } else {
        if (f.reversePennyPollTimer != null) clearInterval(f.reversePennyPollTimer);
        f.reversePennyPollTimer = null;
      }
    });
  }
  // (Dart keeps this polling helper but never starts it; referenced so lint treats it as used.)
  void startReversePennyPolling;
  void maybeReloadAfterRpdSigningCompleted;

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  function permissionList() {
    return Platform.OS === 'android'
      ? [PERMISSIONS.ANDROID.CAMERA, PERMISSIONS.ANDROID.RECORD_AUDIO, PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION]
      : [PERMISSIONS.IOS.CAMERA, PERMISSIONS.IOS.MICROPHONE, PERMISSIONS.IOS.LOCATION_WHEN_IN_USE];
  }

  /** Request permissions BEFORE loading WebView (Android-specific) */
  async function requestPermissionsBeforeLoad(): Promise<void> {
    if (f.permissionsRequested) return;
    f.permissionsRequested = true;
    f.permissionHandlerInFlight = true;

    debugPrint('[WebView] Requesting permissions BEFORE load (Android) for IPV/Face Finder');

    const permissions = permissionList();

    // Important: don't fire multiple permission requests in parallel.
    let results: Record<string, string>;
    try {
      results = (await requestMultiple(permissions as any)) as Record<string, string>;
    } catch (e) {
      debugPrint(`[WebView] Permission request failed: ${e}`);
      f.permissionsRequested = false;
      f.permissionRequestScheduled = false;
      f.permissionHandlerInFlight = false;
      return;
    }
    f.permissionRequestScheduled = false;
    f.permissionHandlerInFlight = false;

    const allGranted = permissions.every(p => {
      const status = results[p as string];
      return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
    });

    if (allGranted) {
      debugPrint('[WebView] All permissions granted before load - WebView will load with camera access');
      // On Android, reload WebView after permissions granted to ensure camera/mic initialize properly
      if (ctrl.isReady && !f.hasReloadedAfterPermissions) {
        f.hasReloadedAfterPermissions = true;
        setTimeout(() => {
          debugPrint('[WebView] Reloading WebView after Android permissions granted');
          ctrl.reload();
        }, 300);
      } else if (!f.hasReloadedAfterPermissions) {
        // Controller not ready yet; reload as soon as it's created.
        f.pendingReloadAfterPermissions = true;
      }
    } else {
      debugPrint('[WebView] Some permissions denied before load');
      Fluttertoast.showToast({
        msg: 'Camera, microphone & location required for face verification',
        long: true,
        backgroundColor: '#FF9800',
        gravity: 'TOP',
      });
    }
  }

  /** Request permissions AFTER WebView loads (iOS or fallback) */
  async function requestPermissionsAndReload(): Promise<void> {
    if (f.permissionsRequested) return;
    f.permissionsRequested = true;
    f.permissionHandlerInFlight = true;

    debugPrint('[WebView] Requesting permissions for IPV/Face Finder');

    const permissions = permissionList();

    let results: Record<string, string>;
    try {
      results = (await requestMultiple(permissions as any)) as Record<string, string>;
    } catch (e) {
      debugPrint(`[WebView] Permission request failed: ${e}`);
      f.permissionsRequested = false;
      f.permissionRequestScheduled = false;
      f.permissionHandlerInFlight = false;
      return;
    }
    f.permissionRequestScheduled = false;
    f.permissionHandlerInFlight = false;

    const allGranted = permissions.every(p => {
      const status = results[p as string];
      return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
    });

    if (allGranted) {
      debugPrint('[WebView] All permissions granted, reloading WebView');
      Fluttertoast.showToast({msg: 'Permissions granted. Reloading...', gravity: 'TOP'});
      if (!f.hasReloadedAfterPermissions && ctrl.isReady) {
        f.hasReloadedAfterPermissions = true;
        setTimeout(() => {
          ctrl.reload();
        }, 500);
      }
    } else {
      debugPrint('[WebView] Some permissions denied');
      Fluttertoast.showToast({
        msg: 'Camera, microphone & location required for face verification',
        long: true,
        backgroundColor: '#FF9800',
        gravity: 'TOP',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Reload helpers
  // ---------------------------------------------------------------------------

  async function reloadWebView(): Promise<void> {
    return reloadWebViewInternal({showToast: true});
  }

  /** Same reload as the AppBar refresh — used by the error overlay Try Again button. */
  async function retryFromErrorOverlay(): Promise<void> {
    if (!ctrl.isReady) {
      debugPrint('[WebView] Try Again: no WebView controller');
      return;
    }
    resetDocumentRetryState();
    cancelLoadTimers();
    if (!f.mounted) return;
    f.hasError = false;
    f.isLoading = true;
    f.loadingMessage = 'Loading...';
    rerender();
    startLoadTimers({url: f.currentUrl});
    try {
      const target = f.currentUrl.trim();
      if (target.length > 0) {
        debugPrint(`[WebView] Try Again: loadUrl ${target}`);
        // loadUrl: remount the WebView with an explicit source (a failed page has no JS context).
        f.loadTarget = target;
        f.webKey++;
        rerender();
      } else {
        await reloadWebViewInternal({showToast: false});
      }
    } catch (e) {
      debugPrint(`[WebView] Try Again loadUrl failed: ${e} — falling back to reload`);
      await reloadWebViewInternal({showToast: false});
    }
  }

  async function reloadWebViewInternal(opts: {showToast: boolean}): Promise<void> {
    try {
      debugPrint(`[WebView] Reloading WebView: ${f.currentUrl}`);
      ctrl.reload();
      if (opts.showToast) {
        Fluttertoast.showToast({msg: 'Page reloaded', gravity: 'TOP'});
      }
    } catch (e) {
      debugPrint(`[WebView] Error reloading: ${e}`);
    }
  }

  function showTransitionLoader(message = 'Preparing next step...'): void {
    if (!f.mounted) return;
    cancelLoadTimers({resetLoadingMessage: false});
    f.isLoading = true;
    f.hasError = false;
    f.loadingMessage = message;
    rerender();
  }

  /** One delayed reload for transient JSON bridge pages — not a periodic loop. */
  function scheduleCloudesignRecovery(urlStr: string, opts: {reason: string}): void {
    if (!usesInAppDocumentAutoRetry(urlStr)) return;
    if (f.cloudesignRecoveryPending && f.cloudesignRecoveryUrl === urlStr) return;
    if (f.cloudesignAutoReloadAttempts >= kMaxCloudesignAutoReloadAttempts) {
      showInAppDocumentRetryAfterFailedRecovery();
      return;
    }

    f.cloudesignRecoveryPending = true;
    f.cloudesignRecoveryUrl = urlStr;
    cancelCloudesignRecovery();

    const attempt = f.cloudesignAutoReloadAttempts + 1;
    const delaySec = 2 + attempt;
    debugPrint(
      `[WebView] Scheduling document reload in ${delaySec}s (attempt ${attempt}/${kMaxCloudesignAutoReloadAttempts}, ${opts.reason})`,
    );

    f.cloudesignRecoveryTimer = setTimeout(async () => {
      f.cloudesignRecoveryPending = false;
      if (!f.mounted || f.redirectHandled) return;
      if (f.currentUrl !== urlStr || !usesInAppDocumentAutoRetry(f.currentUrl)) {
        return;
      }

      f.cloudesignAutoReloadAttempts = attempt;
      debugPrint(
        `[WebView] In-app document reload (attempt ${attempt}/${kMaxCloudesignAutoReloadAttempts}, ${opts.reason})`,
      );
      if (f.mounted) {
        f.isLoading = true;
        f.hasError = false;
        f.loadingMessage = `Preparing document… (${attempt}/${kMaxCloudesignAutoReloadAttempts})`;
        rerender();
      }
      await reloadWebViewInternal({showToast: false});
    }, delaySec * 1000);
  }

  /**
   * Captures query params from completion/success URLs (e.g. RPD: ?success=yes&transaction_id=..., eSign: ?esign=yes)
   * so they can be passed to get-context API. Works for any segment with different params.
   */
  function captureCompletionParamsIfApplicable(url: string): void {
    const uri = uriTryParse(url);
    if (uri == null || Object.keys(uri.queryParameters).length === 0) return;

    const host = uri.host.toLowerCase();
    const path = uri.path.toLowerCase();
    const isWorkflowPath = isOurWorkflowPath(path);
    const isOurDomain =
      (host.includes('meon.co.in') || host.includes('stoxbox.in')) &&
      !host.includes('api.') &&
      !host.includes('accounts.');

    // Known completion params that indicate step completion or carry
    // important status for external flows (eSign, RPD, Reverse Penny Drop, AA CAMS, etc.)
    const completionParamKeys = [
      'esign',
      'success',
      'transaction_id',
      'verifycompleted',
      'reversepennydrop',
      'account_aggregator',
      'ecres',
      'resdate',
      'fi',
    ];
    const hasCompletionParams = Object.keys(uri.queryParameters).some(key =>
      completionParamKeys.includes(key.toLowerCase()),
    );

    // Capture from completion URLs: our domain, has params
    // If workflow path, only capture if it has completion params (e.g. ?esign=yes)
    if (isOurDomain) {
      if (!isWorkflowPath || hasCompletionParams) {
        for (const [key, value] of Object.entries(uri.queryParameters)) {
          const keyLower = key.toLowerCase();
          // Never override routing params (state, client_token, auto) from intermediate domains
          // These should always come from the final workflow URL (bp_flow, etc.)
          if (value.length > 0 && keyLower !== 'state' && keyLower !== 'client_token' && keyLower !== 'auto') {
            f.completionParams[key] = value;
          }
        }
        if (Object.keys(f.completionParams).length > 0) {
          debugPrint(`[WebView] Captured completion params: ${toStr(f.completionParams)}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // External / payment URLs
  // ---------------------------------------------------------------------------

  /** Opens supported payment / deep-link URLs in external apps. */
  async function launchPaymentUri(dataUri: string, packageName?: string | null): Promise<boolean> {
    const targetPackage = packageName ?? packageForPaymentUri(dataUri);
    f.lastPaymentTargetPackage = targetPackage;
    f.lastPaymentAttemptAt = Date.now();
    paymentLog(`launch uri=${dataUri} package=${targetPackage}`);

    if (Platform.OS === 'android') {
      if (await launchPaymentUriNative({dataUri, packageName: targetPackage})) {
        paymentLog(`opened via native channel: ${targetPackage}`);
        return true;
      }

      if (targetPackage != null) {
        paymentLog(`failed to open ${targetPackage}`);
        if (f.mounted && targetPackage === kGooglePayPackage) {
          Fluttertoast.showToast({
            msg: 'Google Pay open nahi ho paya. Google Pay install/check karein.',
            gravity: 'BOTTOM',
          });
        }
        return false;
      }

      if (await launchPaymentUriNative({dataUri, packageName: null})) {
        return true;
      }
    }

    try {
      await Linking.openURL(dataUri);
      return true;
    } catch (e) {
      paymentLog(`generic launch failed: ${e}`);
      return false;
    }
  }

  function shouldBlockGenericUpiFallback(url: string): boolean {
    if (!url.toLowerCase().startsWith('upi://')) return false;
    const pkg = f.lastPaymentTargetPackage;
    const at = f.lastPaymentAttemptAt;
    if (pkg == null || at == null) return false;
    if (Date.now() - at > 8000) return false;
    return pkg === kGooglePayPackage || pkg === 'com.phonepe.app' || pkg === 'net.one97.paytm';
  }

  /** Opens supported payment / deep-link URLs in external apps. */
  async function handleExternalUrl(url: string): Promise<boolean> {
    try {
      const originalUrl = url;

      if (Platform.OS === 'android' && url.toLowerCase().startsWith('intent:')) {
        if (await launchIntentUrlNative(url)) {
          paymentLog('opened via Intent.parseUri');
          markPaymentAppLaunched(originalUrl);
          return true;
        }

        const parsed = parseAndroidPaymentIntentUrl(url);
        const packageName = parsed?.packageName ?? extractIntentPackage(url);
        if (parsed != null) {
          const ok = await launchPaymentUri(parsed.dataUri, packageName);
          if (ok) {
            markPaymentAppLaunched(originalUrl);
            return true;
          }
        }
        return false;
      }

      let finalUrl = url;
      if (finalUrl.toLowerCase().startsWith('ppe://')) {
        finalUrl = `phonepe://${finalUrl.substring('ppe://'.length)}`;
      }

      const lowerUrl = finalUrl.toLowerCase();
      const isPaymentUrl =
        lowerUrl.startsWith('upi://') ||
        lowerUrl.startsWith('phonepe://') ||
        lowerUrl.startsWith('paytmmp://') ||
        lowerUrl.startsWith('paytm://') ||
        lowerUrl.startsWith('gpay://') ||
        lowerUrl.startsWith('tez://') ||
        lowerUrl.startsWith('bhim://') ||
        lowerUrl.startsWith('google.payments://') ||
        lowerUrl.startsWith('googlepay://');

      if (isPaymentUrl) {
        const ok = await launchPaymentUri(finalUrl);
        if (ok) {
          markPaymentAppLaunched(finalUrl);
          return true;
        }
        return false;
      }

      if (await Linking.canOpenURL(finalUrl)) {
        await Linking.openURL(finalUrl);
        markPaymentAppLaunched(finalUrl);
        return true;
      }

      debugPrint(`[WebView] Could not launch URL: ${finalUrl}`);
      return false;
    } catch (e) {
      debugPrint(`[WebView] Error opening external URL: ${e}`);
      return false;
    }
  }

  /** Marks that a payment app was launched (for auto-reload on return) */
  function markPaymentAppLaunched(url: string): void {
    const lower = url.toLowerCase();
    // UPI/payment deep-links can arrive as:
    // - upi://... / phonepe://... / gpay://...
    // - or Android intent://...#Intent;scheme=upi;package=...;end
    const containsUpiScheme = lower.includes('scheme=upi') || lower.startsWith('upi://');
    const containsPhonepeScheme = lower.includes('scheme=phonepe') || lower.startsWith('phonepe://');
    const containsPaytmScheme = lower.includes('scheme=paytm') || lower.startsWith('paytm://');
    const containsPaytmMpScheme = lower.includes('scheme=paytmmp') || lower.startsWith('paytmmp://');
    const containsGpayScheme =
      lower.includes('scheme=gpay') || lower.startsWith('gpay://') || lower.includes('scheme=tez');
    const containsAnyPaymentScheme =
      lower.startsWith('upi://') ||
      lower.startsWith('phonepe://') ||
      lower.startsWith('paytmmp://') ||
      lower.startsWith('paytm://') ||
      lower.startsWith('gpay://') ||
      lower.startsWith('tez://') ||
      lower.startsWith('bhim://') ||
      lower.startsWith('googlepay://') ||
      containsUpiScheme ||
      containsPhonepeScheme ||
      containsPaytmScheme ||
      containsPaytmMpScheme ||
      containsGpayScheme ||
      lower.includes('scheme=upi');

    if (!containsAnyPaymentScheme) return;

    if (isReversePennyDropFlow()) {
      f.upiAppLaunched = true;
      debugPrint(`[WebView] Marked payment app launched (RPD): ${url}`);
    } else {
      // For iOS: mark any payment app launch so we can reload on return
      if (Platform.OS === 'ios') {
        f.paymentAppLaunched = true;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Redirect completion
  // ---------------------------------------------------------------------------

  function buildQuery(params: Record<string, string>): string {
    const entries = Object.entries(params);
    return entries.length === 0
      ? ''
      : `?${entries.map(([k, v]) => `${k}=${encodeComponent(v)}`).join('&')}`;
  }

  /** After DigiLocker WebView, Home must call get-context with `verify=digilocker` (save: true). */
  function appendDigilockerVerifyIfNeeded(queryParams: Record<string, string>): void {
    if (!isDigilockerFlow()) return;
    queryParams.verify = 'digilocker';
    debugPrint('[WebView] DigiLocker flow complete — passing verify=digilocker to Home/get-context');
  }

  async function handleRedirectComplete(opts: {
    state?: string | null;
    clientToken?: string | null;
    auto?: string | null;
    verifyCompleted?: boolean;
  } = {}): Promise<void> {
    const {state, clientToken, auto} = opts;
    const verifyCompleted = opts.verifyCompleted ?? false;
    if (f.redirectHandled || !f.mounted) return;
    f.redirectHandled = true;
    if (!f.mounted) return;
    showTransitionLoader(verifyCompleted ? 'Completing verification...' : 'Preparing next step...');

    // When verifyCompleted=true (IPV success), call get-context API directly
    // Don't navigate to route - let API call handle the data loading
    if (verifyCompleted) {
      const queryParams: Record<string, string> = {};
      if (state != null) queryParams.state = state;
      queryParams.success = 'yes';

      const queryString = buildQuery(queryParams);

      debugPrint(
        `[WebView] IPV success - calling get-context API directly: /api/get-context/${props.company}/${props.workflowName}${queryString}`,
      );

      try {
        const hasToken = await StorageService.hasAccessToken();

        if (hasToken) {
          store.setParams({company: props.company, workflowName: props.workflowName});
          await store.fetchWorkflowFieldsWithAuth(props.company, props.workflowName, queryString);

          if (f.mounted) {
            if (store.errorWithAuth != null) {
              debugPrint(`[WebView] Error after get-context API: ${store.errorWithAuth}`);
              Fluttertoast.showToast({msg: store.errorWithAuth ?? 'Error loading data', gravity: 'TOP'});
            } else {
              debugPrint('[WebView] get-context API completed successfully - navigating back');
            }
            // Navigate back to home page (without query params since API already called).
            // Set flag BEFORE navigation so the new HomePage's first build shows a loader,
            // not the old step UI.
            store.setReturningFromWebView(true);
            goTo(`/${props.company}/${props.workflowName}`);
          }
        } else {
          debugPrint('[WebView] No auth token - navigating with params');
          const query = buildQuery(queryParams);
          if (f.mounted) {
            store.setReturningFromWebView(true);
            goTo(`/${props.company}/${props.workflowName}${query}`);
          }
        }
      } catch (e) {
        debugPrint(`[WebView] Exception calling get-context API: ${e}`);
        if (f.mounted) {
          Fluttertoast.showToast({msg: `Error: ${toStr(e)}`, gravity: 'TOP'});
          // Fallback: navigate with params
          const fallbackParams: Record<string, string> = {...queryParams};
          appendDigilockerVerifyIfNeeded(fallbackParams);
          const query = buildQuery(fallbackParams);
          store.setReturningFromWebView(true);
          goTo(`/${props.company}/${props.workflowName}${query}`);
        }
      }
    } else {
      // For other redirects (DigiLocker, ReversePennyDrop, etc.), navigate with all params
      const queryParams: Record<string, string> = {};
      if (state != null) queryParams.state = state;
      if (clientToken != null) queryParams.client_token = clientToken;
      if (auto != null) queryParams.auto = auto;

      // Add completion params (success=yes, transaction_id=..., etc.) from any segment
      // so get-context API knows step is complete and next step can proceed
      Object.assign(queryParams, f.completionParams);
      appendDigilockerVerifyIfNeeded(queryParams);

      const query = buildQuery(queryParams);

      debugPrint(`[WebView] Going back to: /${props.company}/${props.workflowName}${query}`);
      if (f.mounted) {
        store.setReturningFromWebView(true);
        goTo(`/${props.company}/${props.workflowName}${query}`);
      }
    }
  }

  /** Keep white loader up, stop WebView paint, then run get-context / navigate. */
  async function beginIpvSuccessReturn(url: string): Promise<void> {
    if (f.redirectHandled || f.ipvSuccessHandoff || !f.mounted) return;
    const uri = uriTryParse(url);
    if (uri == null) return;
    f.ipvSuccessHandoff = true;
    cancelLoadTimers({resetLoadingMessage: false});
    f.isLoading = true;
    f.hasError = false;
    f.loadingMessage = 'Completing verification...';
    rerender();
    try {
      ctrl.stopLoading();
    } catch (_) {}
    debugPrint('[WebView] IPV success redirect detected - closing WebView immediately');
    await handleRedirectComplete({
      state: uri.queryParameters.state ?? f.preservedState,
      clientToken: uri.queryParameters.client_token ?? f.preservedClientToken,
      auto: uri.queryParameters.auto ?? f.preservedAuto,
      verifyCompleted: uri.queryParameters.success?.toLowerCase() === 'yes',
    });
  }

  async function onPageFinished(url: string): Promise<void> {
    if (f.redirectHandled || f.ipvSuccessHandoff) return;
    const uri = uriTryParse(url);
    if (uri == null) return;

    const host = uri.host.toLowerCase();
    const path = uri.path.toLowerCase();

    // Also capture completion params from onLoadStop (in case shouldOverride wasn't called)
    captureCompletionParamsIfApplicable(url);

    // Only update preserved routing params from our main frontend domains
    const isMainFrontendHost =
      (host.includes('meon.co.in') &&
        !host.includes('digilocker.') &&
        !host.includes('api.') &&
        !host.includes('accounts.')) ||
      host.includes('stoxbox.in') ||
      host.includes('localhost');

    if (isMainFrontendHost) {
      if ('state' in uri.queryParameters) {
        f.preservedState = uri.queryParameters.state;
      }
      if ('client_token' in uri.queryParameters) {
        f.preservedClientToken = uri.queryParameters.client_token;
      }
      if ('auto' in uri.queryParameters) {
        f.preservedAuto = uri.queryParameters.auto;
      }
    }

    const isFrontendUrl =
      host.includes('stoxbox.in') ||
      (host.includes('meon.co.in') &&
        !host.includes('digilocker.meon.co.in') &&
        !host.includes('api.') &&
        !host.includes('accounts.')) ||
      host.includes('localhost');
    const isWorkflowPath = isOurWorkflowPath(path);
    const isReversePennyRoute = path.includes('/reverse_pennydrop/');
    const hasVerifyParam = 'verify' in uri.queryParameters;

    const initialUri = uriTryParse(props.url);
    const initialHost = initialUri?.host.toLowerCase() ?? '';
    const initialWasVerifyPage =
      (initialHost.includes('stoxbox.in') ||
        (initialHost.includes('meon.co.in') &&
          !initialHost.includes('digilocker') &&
          !initialHost.includes('ext-'))) &&
      initialUri != null &&
      'verify' in initialUri.queryParameters;
    const initialWasIpvOrFace = isIpvOrFaceFinderUrl(props.url);
    const completionSuccess =
      f.completionParams.success?.toString().toLowerCase() === 'yes' ||
      uri.queryParameters.success?.toLowerCase() === 'yes';

    if (hasVerifyParam) {
      debugPrint('[WebView] Currently on verify page - staying open');
      return;
    }

    // For Reverse Penny Drop, we must keep the WebView open on
    // /reverse_pennydrop/... so the Digio popup can complete.
    // Treat only the plain workflow URL (/company/workflowName) as "clean".
    const isCleanWorkflowUrl = isFrontendUrl && isWorkflowPath && !hasVerifyParam && !isReversePennyRoute;

    if (isCleanWorkflowUrl && initialWasVerifyPage) {
      if (!f.hasSeenCleanUrl) {
        f.hasSeenCleanUrl = true;
        debugPrint('[WebView] Verify page auto-redirected - staying open');
        return;
      } else {
        debugPrint('[WebView] Verify form submitted - closing WebView');
        showTransitionLoader('Completing verification...');
        await handleRedirectComplete({
          state: uri.queryParameters.state ?? f.preservedState,
          clientToken: uri.queryParameters.client_token ?? f.preservedClientToken,
          auto: uri.queryParameters.auto ?? f.preservedAuto,
          verifyCompleted: true,
        });
      }
    } else if (isCleanWorkflowUrl && !initialWasVerifyPage) {
      // Face Finder often lands on /COMPANY/workflow with no query after success=yes on face-finder.
      const asIpvSuccess = initialWasIpvOrFace && completionSuccess;
      debugPrint(
        asIpvSuccess
          ? '[WebView] Face/IPV return to workflow URL - closing WebView'
          : '[WebView] External flow completed - closing WebView',
      );
      showTransitionLoader(asIpvSuccess ? 'Completing verification...' : 'Preparing next step...');
      await handleRedirectComplete({
        state: uri.queryParameters.state ?? f.preservedState,
        clientToken: uri.queryParameters.client_token ?? f.preservedClientToken,
        auto: uri.queryParameters.auto ?? f.preservedAuto,
        verifyCompleted: asIpvSuccess,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Script injection helpers
  // ---------------------------------------------------------------------------

  /** DigiLocker step only — freeze viewport while form fields are focused. */
  async function injectDigilockerFreezeJs(c: WebViewController): Promise<void> {
    if (!isDigilockerFlow()) return;
    try {
      c.inject(DIGILOCKER_FREEZE_JS);
    } catch (e) {
      debugPrint(`[WebView] Error injecting DigiLocker freeze JS: ${e}`);
    }
  }

  /**
   * Injects JavaScript to prevent automatic scroll jumps on input focus.
   * This keeps the WebView from auto-scrolling when the keyboard opens;
   * users can still scroll manually.
   */
  async function injectNoAutoScrollJs(c: WebViewController, opts: {url?: string | null} = {}): Promise<void> {
    if (isDigilockerFlow(opts.url)) {
      await injectDigilockerFreezeJs(c);
      return;
    }
    try {
      c.inject(NO_AUTO_SCROLL_JS);
    } catch (e) {
      debugPrint(`[WebView] Error injecting no-auto-scroll JS: ${e}`);
    }
  }

  /**
   * DigiLocker-only scroll guards. (Native over-scroll/bounce settings are applied through the
   * WebView props in render; here we only inject the freeze JS.)
   */
  async function applyDigilockerScrollGuards(c: WebViewController, opts: {url?: string | null} = {}): Promise<void> {
    if (!isDigilockerFlow(opts.url)) return;
    await injectDigilockerFreezeJs(c);
  }

  async function injectAccountAggregatorViewportFix(
    c: WebViewController,
    opts: {url?: string | null} = {},
  ): Promise<void> {
    const sample = opts.url ?? activeWebViewUrl();
    if (!isAccountAggregatorUrl(sample) && !title.toLowerCase().includes('account aggregator')) {
      return;
    }
    try {
      c.inject(ACCOUNT_AGGREGATOR_VIEWPORT_FIX_JS);
    } catch (e) {
      debugPrint(`[WebView] AA viewport fix inject error: ${e}`);
    }
  }

  /**
   * iOS AA / Proceed-to-eSign: scroll focused Aadhaar/OTP/mobile field above keyboard.
   * Does not disable scrollIntoView (needed for CAMS/Digio OTP).
   */
  async function injectAccountAggregatorKeyboardAssist(
    c: WebViewController,
    opts: {url?: string | null} = {},
  ): Promise<void> {
    if (!needsIosKeyboardFieldAssist(opts.url)) return;
    try {
      c.inject(ACCOUNT_AGGREGATOR_KEYBOARD_ASSIST_JS);
      debugPrint('[WebView] iOS keyboard field assist injected');
    } catch (e) {
      debugPrint(`[WebView] iOS keyboard field assist inject error: ${e}`);
    }
  }

  async function nudgeIosKeyboardFocusedField(): Promise<void> {
    if (!needsIosKeyboardFieldAssist()) return;
    if (!ctrl.isReady) return;
    try {
      ctrl.inject(
        'try { if (window.__meonAaNudgeKeyboardField) window.__meonAaNudgeKeyboardField(); } catch (e) {}',
      );
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Back handling
  // ---------------------------------------------------------------------------

  async function handleBackPressed(): Promise<void> {
    if (f.rpdBackLoading) return;

    if (!isReversePennyDropFlow()) {
      if (f.mounted) {
        goTo(`/${props.company}/${props.workflowName}`);
      }
      return;
    }

    f.rpdBackLoading = true;
    rerender();
    store.setRpdReturn(true);
    store.setReturningFromWebView(true);

    try {
      debugPrint('[WebView] RPD back — calling position-update (position=11)');
      const posRes = await KycAPI.positionUpdate('11');
      debugPrint(`[WebView] position-update response: ${posRes.statusCode}`);

      store.setParams({company: props.company, workflowName: props.workflowName});
      await store.fetchWorkflowFieldsWithAuth(props.company, props.workflowName, '', {
        postBody: {rpd_return: true},
      });

      if (!f.mounted) return;
      if (store.errorWithAuth != null) {
        Fluttertoast.showToast({msg: store.errorWithAuth ?? 'Error loading data', gravity: 'TOP'});
      }
      goTo(`/${props.company}/${props.workflowName}`);
    } catch (e) {
      debugPrint(`[WebView] RPD back flow error: ${e}`);
      if (f.mounted) {
        Fluttertoast.showToast({msg: 'Error navigating back', gravity: 'TOP'});
        goTo(`/${props.company}/${props.workflowName}`);
      }
    } finally {
      if (f.mounted) {
        f.rpdBackLoading = false;
        rerender();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // WebView callbacks
  // ---------------------------------------------------------------------------

  /** Equivalent of `onWebViewCreated` (called when the native ref attaches). */
  function onWebViewCreated(): void {
    if (f.pendingReloadAfterPermissions && !f.hasReloadedAfterPermissions) {
      f.pendingReloadAfterPermissions = false;
      f.hasReloadedAfterPermissions = true;
      setTimeout(() => {
        debugPrint('[WebView] Pending reload after permissions - reloading WebView');
        ctrl.reload();
      }, 300);
    }
  }

  /** Main WebView `shouldOverrideUrlLoading` (synchronous in RN: true = ALLOW, false = CANCEL). */
  function shouldOverrideUrlLoading(request: ShouldStartLoadRequest): boolean {
    const url = request.url;
    if (url == null || url.length === 0) return true;
    wvLog(`[WebView] Navigation request: ${url}`);

    // pdf.js blob: save PDF in-page — do NOT navigate (avoids reload/loader).
    if (isProceedToEsignFlowContext() && isBlobDownloadUrl(url)) {
      const hasGesture = f.gesture;
      if (hasGesture || (Platform.OS === 'ios' && f.initialPageLoaded)) {
        if (!hasGesture) {
          try {
            ctrl.inject('window.__meonUserGestureForDownload = true;');
          } catch (_) {}
          f.gesture = true;
        }
        debugPrint('[WebView] Blob PDF download — in-page save, no navigation');
        void handleEsignPdfDownload(ctrl, {downloadUrl: url, skipGestureCheck: true});
      }
      return false;
    }

    // Block direct PDF navigations on eSign until user taps download.
    if (isProceedToEsignFlowContext() && looksLikePdfFileNavigation(url)) {
      if (!f.gesture) {
        debugPrint(`[WebView] Blocked auto PDF navigation: ${url}`);
        return false;
      }
      // User tapped download: RN cannot intercept the response, so save the PDF natively
      // (Flutter: onNavigationResponse -> DOWNLOAD).
      void handleEsignPdfDownload(ctrl, {downloadUrl: url, mimeType: 'application/pdf'});
      return false;
    }

    // Cloudesign document with a user tap behaves like a download (Flutter: DOWNLOAD action)
    if (isCloudesignDocumentUrl(url) && f.gesture && f.initialPageLoaded) {
      debugPrint(`[WebView] Cloudesign document — user download: ${url}`);
      void handleEsignPdfDownload(ctrl, {downloadUrl: url, mimeType: 'application/pdf'});
      return false;
    }

    // Always cancel intent: URLs on Android to prevent ERR_UNKNOWN_URL_SCHEME error
    if (Platform.OS === 'android' && url.toLowerCase().startsWith('intent:')) {
      wvLog('[WebView] Intent URL detected - handling externally');
      void handleExternalUrl(url);
      return false;
    }

    if (shouldHandleExternally(url)) {
      // Flutter awaited the launch and only cancelled when handled; RN callbacks are
      // synchronous so the navigation is always cancelled and the launch runs async.
      void handleExternalUrl(url).then(handled => {
        if (handled) {
          debugPrint('[WebView] External URL handled by app, cancelling WebView navigation');
        }
      });
      return false;
    }

    // Capture completion params from success/return URLs (e.g. ?success=yes&transaction_id=...)
    // Works for RPD, DigiLocker, and other segments - any URL with params before final workflow URL
    captureCompletionParamsIfApplicable(url);

    // IPV/Face success return — never load ekyc website; API only.
    if (!f.redirectHandled && !f.ipvSuccessHandoff && isIpvOrFaceSuccessReturnUrl(url)) {
      void beginIpvSuccessReturn(url);
      return false;
    }

    // Reverse Penny Drop: if completion params appear in URL, close WebView immediately (no timer needed)
    if (isReversePennyDropUrl(url) && !f.redirectHandled && !f.rpdSuccessHandled) {
      const uri = uriTryParse(url);
      if (uri != null && Object.keys(uri.queryParameters).length > 0) {
        const completionParamKeys = ['success', 'transaction_id', 'reversepennydrop', 'esign'];
        const hasCompletionParams = Object.keys(uri.queryParameters).some(key =>
          completionParamKeys.includes(key.toLowerCase()),
        );
        if (hasCompletionParams) {
          debugPrint('[WebView] RPD completion params detected in URL - closing WebView');
          f.rpdSuccessHandled = true;
          Object.assign(f.completionParams, uri.queryParameters);
          if (!('success' in f.completionParams)) {
            f.completionParams.success = 'yes';
          }
          try {
            store.setRpdSuccessReturn(true);
          } catch (_) {}
          void handleRedirectComplete({
            state: uri.queryParameters.state ?? f.preservedState,
            clientToken: uri.queryParameters.client_token ?? f.preservedClientToken,
            auto: uri.queryParameters.auto ?? f.preservedAuto,
            verifyCompleted: false,
          });
          return false;
        }
      }
    }

    return true;
  }

  /** `onLoadStart` */
  async function onLoadStart(e: WebViewNavigationEvent): Promise<void> {
    const urlStr = e.nativeEvent.url;
    if (urlStr != null && urlStr.length > 0 && !f.redirectHandled && !f.ipvSuccessHandoff) {
      // Blob URLs are PDF downloads — never treat as a page load.
      if (isBlobDownloadUrl(urlStr)) {
        debugPrint('[WebView] Ignoring blob onLoadStart (PDF download only)');
        return;
      }
      f.isLoading = true;
      f.hasError = false;
      f.currentUrl = urlStr;
      rerender();
      startLoadTimers({url: urlStr});
      debugPrint(`[WebView] Page started: ${urlStr}`);

      if (isProceedToEsignFlowContext(urlStr)) {
        await resetEsignDownloadUserGesture(ctrl);
      }
      if (isCloudesignDocumentUrl(urlStr)) {
        f.cloudesignInterruptRecoveryUsed = false;
      }

      // IPV/Face Finder success: redirect to .../individual?state=...&success=yes
      // Do not paint the website — stop load + get-context API only.
      if (isIpvOrFaceSuccessReturnUrl(urlStr)) {
        await beginIpvSuccessReturn(urlStr);
        return;
      }

      // Request permissions on load (iOS or if Android permissions weren't requested before)
      if (isIpvOrFaceFinderUrl(urlStr) && !f.permissionsRequested && !f.permissionRequestScheduled) {
        if (Platform.OS === 'android') {
          setTimeout(() => {
            void requestPermissionsBeforeLoad();
          }, 0);
        } else {
          setTimeout(() => {
            void requestPermissionsAndReload();
          }, 0);
        }
      }
    }
  }

  /** `onLoadError` / `onReceivedError` (main frame) */
  function onLoadError(e: WebViewErrorEvent): void {
    const {code, description, url} = e.nativeEvent;
    const message = description ?? '';
    const errorUrl = url ?? '';
    debugPrint(`[WebView] Load error (${code}): ${message}, url=${errorUrl}`);
    // Ignore unknown URL scheme errors — these are UPI/intent
    // deep-links handled externally and are not real page failures.
    if ((code === -10 && message.includes('net::ERR_UNKNOWN_URL_SCHEME')) || isPaymentDeepLink(errorUrl)) {
      if (isPaymentDeepLink(errorUrl) && !shouldBlockGenericUpiFallback(errorUrl)) {
        void handleExternalUrl(errorUrl);
      }
      return;
    }
    if (isCloudesignLoadInterruptError({url: errorUrl, code, description: message})) {
      debugPrint('[WebView] Cloudesign load interrupted by download policy — keeping inline view');
      if (!f.cloudesignInterruptRecoveryUsed && !f.redirectHandled) {
        f.cloudesignInterruptRecoveryUsed = true;
        Promise.resolve().then(() => ctrl.reload());
      }
      return;
    }
    surfaceWebViewLoadFailure({errorUrl, code, description: message});
  }

  /** `onLoadStop` */
  async function onLoadStop(e: WebViewNavigationEvent): Promise<void> {
    const urlStr = e.nativeEvent.url;
    if (urlStr == null || urlStr.length === 0) return;
    // IPV already handed off to get-context — never hide loader / paint site.
    if (f.redirectHandled || f.ipvSuccessHandoff) {
      debugPrint(`[WebView] Ignoring page finished after redirect handoff: ${urlStr}`);
      return;
    }
    // Stop timeout/hint timers but keep overlay up briefly on eSign/PDF
    // so pdf.js / canvas can paint (avoids blank flash).
    cancelLoadTimers({resetLoadingMessage: false});
    const heavyDoc = isEsignPdfHeavyUrl(urlStr);

    // Hide transient JSON on cloudesign document URLs only (not eSign SPA).
    if (isCloudesignDocumentUrl(urlStr)) {
      const bodyText = await readMainFrameBodyText(ctrl);
      if (isTransientEsignBridgePayload(urlStr, bodyText)) {
        debugPrint(
          '[WebView] Transient eSign/JSON payload detected — keeping loader until retry succeeds',
        );
        if (!f.mounted) return;
        f.isLoading = true;
        f.hasError = false;
        f.loadingMessage = 'Preparing eSign document...';
        f.currentUrl = urlStr;
        rerender();
        startLoadTimers({url: urlStr, resetMessageOnCancel: false});
        if (usesInAppDocumentAutoRetry(urlStr) && !f.redirectHandled) {
          scheduleCloudesignRecovery(urlStr, {reason: 'transient JSON bridge'});
        }
        await onPageFinished(urlStr);
        await applyDigilockerScrollGuards(ctrl, {url: urlStr});
        if (shouldInjectNoAutoScrollJs(urlStr)) {
          await injectNoAutoScrollJs(ctrl, {url: urlStr});
        }
        await injectAccountAggregatorViewportFix(ctrl, {url: urlStr});
        await injectAccountAggregatorKeyboardAssist(ctrl, {url: urlStr});
        return;
      }
    }

    // Account Aggregator: sometimes backend returns a short "Pretty print"
    // JSON error page (success:false, error:..., url:"") instead of a valid
    // next URL. Detect it and do a limited reload so the app can proceed.
    if (
      isAccountAggregatorFlow() &&
      !f.redirectHandled &&
      f.aaJsonErrorAutoReloadAttempts < kMaxAaJsonErrorAutoReloadAttempts &&
      f.aaJsonErrorAutoReloadUrl !== urlStr
    ) {
      // Prevent raw JSON "Pretty print" page flash: show loader
      // immediately, then confirm via body text.
      if (!f.mounted) return;
      f.isLoading = true;
      f.hasError = false;
      f.loadingMessage = 'Preparing...';
      f.currentUrl = urlStr;
      rerender();

      const bodyText = await readMainFrameBodyText(ctrl);
      const t = bodyText.trim().toLowerCase();
      const statusFalse =
        t.includes('"success":false') ||
        t.includes('"success": false') ||
        t.includes('"status":false') ||
        t.includes('"status": false');
      const hasError = t.includes('"error"') || t.includes('argument of type') || t.includes('nonetype');
      const urlEmpty =
        t.includes('"url":""') || t.includes('"url": ""') || t.includes('"url":"') || t.includes('"url": "');

      if (t.length > 0 && t.length <= 8000 && statusFalse && hasError && urlEmpty) {
        f.aaJsonErrorAutoReloadAttempts++;
        f.aaJsonErrorAutoReloadUrl = urlStr;
        debugPrint(
          `[WebView] AA transient JSON error detected — auto-reloading (attempt ${f.aaJsonErrorAutoReloadAttempts}/${kMaxAaJsonErrorAutoReloadAttempts})`,
        );
        await reloadWebViewInternal({showToast: false});
        return;
      }
    }

    if (heavyDoc && f.mounted) {
      f.loadingMessage = 'Rendering document...';
      rerender();
      await delay(1400);
    }
    if (!f.mounted) return;
    f.isLoading = false;
    f.hasError = false;
    f.initialPageLoaded = true;
    f.currentUrl = urlStr;
    f.loadingMessage = 'Loading...';
    rerender();
    if (isIpvOrFaceFinderUrl(urlStr)) {
      f.ipvLoadErrorAutoRetryCount = 0;
    }
    debugPrint(`[WebView] Page finished: ${urlStr}`);

    // Successful load — stop retries; let the page stay visible.
    cancelCloudesignRecovery();
    f.cloudesignRecoveryPending = false;
    resetDocumentRetryState();
    f.aaJsonErrorAutoReloadAttempts = 0;
    f.aaJsonErrorAutoReloadUrl = null;

    if (isProceedToEsignFlowContext(urlStr)) {
      await injectEsignDownloadUserGestureTracker(ctrl);
    }

    // For eSign pages, nudge initial scroll slightly so
    // important inputs are not hidden under the keyboard.
    try {
      const uri = uriTryParse(urlStr);
      if (uri != null) {
        const host = uri.host.toLowerCase();
        const isCloudesign = host.includes('cloudesign');
        const isNsdlEsign = host.includes('esign.egov.proteantech.in') || host.startsWith('esign.');
        if (!f.esignScrollAdjusted && (isCloudesign || isNsdlEsign)) {
          f.esignScrollAdjusted = true;
          // (controller.scrollTo + window.scrollTo collapse to the in-page scroll)
          await ctrl.evaluate('try { window.scrollTo(0, 260); } catch(e) {}');
        }
      }
    } catch (err) {
      debugPrint(`[WebView] Error adjusting scroll for eSign: ${err}`);
    }

    if (isIpvOrFaceFinderUrl(urlStr) && f.permissionsRequested && !f.hasReloadedAfterPermissions) {
      setTimeout(() => {
        if (f.mounted && f.currentUrl === urlStr && !f.hasReloadedAfterPermissions) {
          f.hasReloadedAfterPermissions = true;
          debugPrint('[WebView] Reloading IPV page after permission grant');
          ctrl.reload();
        }
      }, 300);
    }

    await onPageFinished(urlStr);
    await applyDigilockerScrollGuards(ctrl, {url: urlStr});
    if (shouldInjectNoAutoScrollJs(urlStr)) {
      await injectNoAutoScrollJs(ctrl, {url: urlStr});
    }
    await injectAccountAggregatorViewportFix(ctrl, {url: urlStr});
    await injectAccountAggregatorKeyboardAssist(ctrl, {url: urlStr});
    if (isReversePennyDropUrl(urlStr)) {
      if (!f.rpdSigningSessionFlagReset) {
        try {
          ctrl.inject('try { sessionStorage.removeItem("meon_rpd_signing_reloaded"); } catch(e) {}');
        } catch (_) {}
        f.rpdSigningSessionFlagReset = true;
      }
      await injectRpdConsoleSigningReload(ctrl);
      await injectRpdTimerOverride(ctrl);
    }

    // Reverse Penny Drop: check if completion params appeared in URL (params = completion indicator)
    if (isReversePennyDropUrl(urlStr) && !f.redirectHandled && !f.rpdSuccessHandled) {
      const uri = uriTryParse(urlStr);
      if (uri != null && Object.keys(uri.queryParameters).length > 0) {
        const completionParamKeys = ['success', 'transaction_id', 'reversepennydrop', 'esign'];
        const hasCompletionParams = Object.keys(uri.queryParameters).some(key =>
          completionParamKeys.includes(key.toLowerCase()),
        );
        if (hasCompletionParams) {
          debugPrint('[WebView] RPD completion params detected in URL onLoadStop - closing WebView');
          f.rpdSuccessHandled = true;
          Object.assign(f.completionParams, uri.queryParameters);
          if (!('success' in f.completionParams)) {
            f.completionParams.success = 'yes';
          }
          try {
            store.setRpdSuccessReturn(true);
          } catch (_) {}
          await handleRedirectComplete({
            state: uri.queryParameters.state ?? f.preservedState,
            clientToken: uri.queryParameters.client_token ?? f.preservedClientToken,
            auto: uri.queryParameters.auto ?? f.preservedAuto,
            verifyCompleted: false,
          });
        }
      }
    }
  }

  /** `onCreateWindow` (window.open) for Digio popups. */
  function onOpenWindow(e: WebViewOpenWindowEvent): void {
    const popupUrl = e.nativeEvent.targetUrl ?? '';
    debugPrint(`[WebView] onCreateWindow: ${popupUrl}`);

    if (!enablePopupWindows()) {
      return;
    }

    // A real URL: show it in the overlay WebView (Flutter binds a windowId overlay; RN has no
    // window handle so the target URL is loaded in the overlay instead).
    if (popupUrl.length > 0 && popupUrl !== 'about:blank') {
      f.popupUrl = popupUrl;
      f.popupOpen = true;
      rerender();
    }
  }

  /** `onCloseWindow` – hide popup overlay, reload main page for Digio eSign. */
  function onCloseWindow(): void {
    // Popup window closed – hide overlay
    if (f.popupOpen) {
      f.popupOpen = false;
      f.popupUrl = null;
      rerender();
      // For flows that rely on Digio-style popups (Reverse Penny Drop, Digio eSign),
      // after the popup closes, reload main page so it can fetch updated success state / params.
      if (isDigioEsignFlow() && ctrl.isReady && !f.redirectHandled && !f.rpdSuccessHandled) {
        setTimeout(async () => {
          if (!f.mounted || f.redirectHandled || f.rpdSuccessHandled) return;
          debugPrint('[WebView] Popup closed - reloading main page to fetch success state with params');
          ctrl.reload();
        }, 500);
      }
    }
  }

  /** Popup WebView `shouldOverrideUrlLoading` */
  function popupShouldOverride(request: ShouldStartLoadRequest): boolean {
    const url = request.url;
    if (url == null || url.length === 0) return true;
    wvLog(`[WebView][Popup] Navigation request: ${url}`);

    // Always cancel intent: URLs on Android to prevent ERR_UNKNOWN_URL_SCHEME error
    if (Platform.OS === 'android' && url.toLowerCase().startsWith('intent:')) {
      wvLog('[WebView][Popup] Intent URL detected - handling externally');
      void handleExternalUrl(url);
      return false;
    }

    if (shouldHandleExternally(url)) {
      void handleExternalUrl(url);
      return false;
    }

    // Digio can navigate/complete by updating query params within the popup.
    // Capture those completion params and immediately trigger the same backend
    // completion flow as we do on the main WebView.
    captureCompletionParamsIfApplicable(url);
    const popupUri = uriTryParse(url);
    if (
      popupUri != null &&
      Object.keys(popupUri.queryParameters).length > 0 &&
      !f.redirectHandled &&
      !f.rpdSuccessHandled
    ) {
      const completionParamKeys = ['success', 'transaction_id', 'reversepennydrop', 'reverse_pennydrop', 'esign'];
      const hasCompletionParams = Object.keys(popupUri.queryParameters).some(key =>
        completionParamKeys.includes(key.toLowerCase()),
      );
      if (hasCompletionParams) {
        if ('reversepennydrop' in popupUri.queryParameters || 'reverse_pennydrop' in popupUri.queryParameters) {
          f.rpdSuccessHandled = true;
        }

        void handleRedirectComplete({
          state: popupUri.queryParameters.state ?? f.preservedState,
          clientToken: popupUri.queryParameters.client_token ?? f.preservedClientToken,
          auto: popupUri.queryParameters.auto ?? f.preservedAuto,
          verifyCompleted: false,
        });
        return false;
      }
    }

    return true;
  }

  function popupOnLoadError(e: WebViewErrorEvent): void {
    const {code, description, url} = e.nativeEvent;
    const errorUrl = url ?? '';
    if (
      code === -10 &&
      (description ?? '').includes('net::ERR_UNKNOWN_URL_SCHEME') &&
      isPaymentDeepLink(errorUrl) &&
      !shouldBlockGenericUpiFallback(errorUrl)
    ) {
      void handleExternalUrl(errorUrl);
      return;
    }
    wvLog(`[WebView][Popup] Load error (${code}): ${description}, url=${url}`);
  }

  async function popupOnLoadStop(e: WebViewNavigationEvent): Promise<void> {
    const urlStr = e.nativeEvent.url;
    if (urlStr == null || urlStr.length === 0) return;
    if (shouldInjectNoAutoScrollJs(urlStr)) {
      await injectNoAutoScrollJs(popupCtrl, {url: urlStr});
    }
    await injectAccountAggregatorViewportFix(popupCtrl, {url: urlStr});
    await injectAccountAggregatorKeyboardAssist(popupCtrl, {url: urlStr});

    if (isReversePennyDropUrl(urlStr)) {
      if (!f.rpdSigningSessionFlagReset) {
        try {
          popupCtrl.inject('try { sessionStorage.removeItem("meon_rpd_signing_reloaded"); } catch(e) {}');
        } catch (_) {}
        f.rpdSigningSessionFlagReset = true;
      }
      await injectRpdConsoleSigningReload(popupCtrl);
      await injectRpdTimerOverride(popupCtrl);
    }

    // Digio gateway popup (app.digio.in/#/gateway/...)
    // hosts the visible 5-min countdown when the user
    // is entering UPI ID / picking an app, so we need
    // to inject the override here too.
    if (isDigioGatewayUrl(urlStr)) {
      await injectRpdTimerOverride(popupCtrl);
    }
  }

  function onMessage(e: WebViewMessageEvent, c: WebViewController, isPopup: boolean): void {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch (_) {
      return;
    }
    if (msg == null || typeof msg !== 'object' || msg.__meon == null) return;
    if (c.handleMessage(msg)) return;
    switch (msg.__meon) {
      case 'gesture':
        f.gesture = msg.value === true;
        break;
      case 'blobDownload':
        void onDownloadStartRequest(c, String(msg.url ?? ''), {
          suggestedFilename: msg.filename ? String(msg.filename) : null,
          mimeType: msg.mimeType ? String(msg.mimeType) : null,
          prefetchedBase64: msg.data ? String(msg.data) : null,
        });
        break;
      case 'blobDownloadError':
        debugPrint(`[WebView] Blob read failed: ${msg.error}`);
        showEsignDownloadMessage('Download failed. Please try again.', {isError: true});
        break;
      case 'closeWindow':
        if (isPopup) onCloseWindow();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle (initState / dispose / app lifecycle / metrics)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    f.mounted = true;
    debugPrint(
      `[WebView] Initial params from URL: state=${f.preservedState}, client_token=${f.preservedClientToken}, auto=${f.preservedAuto}`,
    );

    // For Android: Request permissions BEFORE loading IPV page to ensure camera/mic work
    // For iOS: Permissions can be requested after load (works fine)
    if (isIpvOrFaceFinderUrl(props.url)) {
      if (Platform.OS === 'android') {
        // Request permissions immediately on Android before WebView loads
        f.ipvPermissionGateActive = true;
        rerender();
        setTimeout(() => {
          // Prevent duplicate scheduling between initState and onLoadStart.
          f.permissionRequestScheduled = true;
          // Gate WebView rendering until permissions request completes.
          void (async () => {
            await requestPermissionsBeforeLoad();
            if (!f.mounted) return;
            f.ipvPermissionGateActive = false;
            rerender();
          })();
        }, 0);
      } else {
        // iOS: Request after load (existing behavior)
        setTimeout(() => {
          void requestPermissionsAndReload();
        }, 0);
      }
    }

    f.lastReconnectToken = connectivity.reconnectToken;
    const onInternetRestored = () => {
      if (!f.mounted) return;
      if (connectivity.reconnectToken === f.lastReconnectToken) return;
      f.lastReconnectToken = connectivity.reconnectToken;
      if (!connectivity.isConnected) return;
      debugPrint('[WebView] Internet restored — reloading page');
      ctrl.reload();
    };
    connectivity.addListener(onInternetRestored);

    // didChangeAppLifecycleState: When returning from a payment app, auto-reload the WebView
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (isReversePennyDropFlow() && f.upiAppLaunched) {
          f.upiAppLaunched = false;
          // Auto-reload/polling disabled temporarily to avoid hard refresh loops
          // while user is still interacting with the RPD flow.
          // Completion handling is handled via query-param capture.
        } else if (f.paymentAppLaunched) {
          // For iOS: auto-reload when returning from any payment app
          f.paymentAppLaunched = false;
          debugPrint('[WebView] App resumed after payment - reloading WebView');
          setTimeout(() => {
            void reloadWebView();
          }, 500);
        }
      }
    });

    // didChangeMetrics (iOS keyboard) -> nudge focused field
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, ev => {
      f.keyboardVisible = true;
      rerender();
      if (Platform.OS !== 'ios' || !needsIosKeyboardFieldAssist()) return;
      const bottom = ev.endCoordinates.height;
      const openedOrGrew = bottom > 80 && bottom > f.lastKeyboardBottomInset + 8;
      f.lastKeyboardBottomInset = bottom;
      if (!openedOrGrew) return;
      // Single delayed nudge — triple-fire made CAMS OTP sheet jump while typing digits.
      setTimeout(() => {
        void nudgeIosKeyboardFocusedField();
      }, 350);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      f.keyboardVisible = false;
      f.lastKeyboardBottomInset = 0;
      rerender();
    });

    // PopScope(canPop: !_isReversePennyDropFlow)
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isReversePennyDropFlow()) {
        void handleBackPressed();
        return true;
      }
      return false;
    });

    return () => {
      f.mounted = false;
      connectivity.removeListener(onInternetRestored);
      appStateSub.remove();
      showSub.remove();
      hideSub.remove();
      backSub.remove();
      if (f.reversePennyPollTimer != null) clearInterval(f.reversePennyPollTimer);
      if (f.loadTimeoutTimer != null) clearTimeout(f.loadTimeoutTimer);
      if (f.slowNetworkTimer != null) clearTimeout(f.slowNetworkTimer);
      if (f.loadHintTimer2 != null) clearTimeout(f.loadHintTimer2);
      if (f.snackTimer != null) clearTimeout(f.snackTimer);
      cancelCloudesignRecovery();
      ctrl.dispose();
      popupCtrl.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------
  const aa = isAccountAggregatorFlow();
  const digilocker = isDigilockerFlow(props.url);
  const userScript = initialUserScript();
  const popupEnabled = enablePopupWindows();

  const body = (
    <View style={{flex: 1, paddingBottom: aa || f.keyboardVisible ? 0 : insets.bottom}}>
      {/* Main WebView */}
      {f.ipvPermissionGateActive ? (
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <ActivityIndicator size="large" color={KycTheme.primary} />
        </View>
      ) : (
        <WebView
          key={f.webKey}
          ref={(r: any) => {
            const first = webRef.current == null && r != null;
            webRef.current = r;
            if (first) onWebViewCreated();
          }}
          source={{uri: f.loadTarget ?? props.url}}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          // pdf.js blob downloads are intercepted in-page (see ESIGN_BLOB_DOWNLOAD_HOOK_JS)
          onFileDownload={(ev: FileDownloadEvent): void => {
            void onDownloadStartRequest(ctrl, ev.nativeEvent.downloadUrl);
          }}
          injectedJavaScriptBeforeContentLoaded={userScript}
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          // Allow JS popups / window.open only for special flows (Reverse Penny Drop, Digio eSign, etc.)
          javaScriptCanOpenWindowsAutomatically={popupEnabled}
          setSupportMultipleWindows={popupEnabled}
          onOpenWindow={onOpenWindow}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          mediaCapturePermissionGrantType="grant"
          // DigiLocker step: no rubber-band / inset scroll while typing Aadhaar/PIN
          bounces={digilocker ? false : undefined}
          overScrollMode={digilocker ? 'never' : undefined}
          contentInsetAdjustmentBehavior={digilocker ? 'never' : aa ? 'always' : undefined}
          // Disable pinch-zoom to keep layout stable
          setSupportZoom={false}
          scalesPageToFit={aa ? true : undefined}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          // Enable geolocation for IPV/Face Finder (required for location-based verification)
          geolocationEnabled
          onShouldStartLoadWithRequest={(ev: ShouldStartLoadRequestEvent | ShouldStartLoadRequest): boolean =>
            shouldOverrideUrlLoading('nativeEvent' in ev ? (ev as any).nativeEvent : (ev as ShouldStartLoadRequest))
          }
          onLoadStart={(ev: WebViewNavigationEvent): void => {
            void onLoadStart(ev);
          }}
          onLoad={(ev: WebViewNavigationEvent): void => {
            void onLoadStop(ev);
          }}
          onError={onLoadError}
          onMessage={(ev: WebViewMessageEvent): void => onMessage(ev, ctrl, false)}
          style={{flex: 1, backgroundColor: '#FFFFFF'}}
        />
      )}

      {/* Popup overlay WebView for reverse_pennydrop (Digio window.open) */}
      {f.popupOpen && f.popupUrl != null ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.54)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View style={{width: '95%', height: '90%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFF'}}>
            <WebView
              ref={popupWebRef as any}
              source={{uri: f.popupUrl}}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              injectedJavaScriptBeforeContentLoaded={POPUP_CLOSE_HOOK_JS}
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              mediaCapturePermissionGrantType="grant"
              setSupportZoom={false}
              // Enable geolocation for popup WebView as well
              geolocationEnabled
              onShouldStartLoadWithRequest={(ev: ShouldStartLoadRequestEvent | ShouldStartLoadRequest): boolean =>
                popupShouldOverride('nativeEvent' in ev ? (ev as any).nativeEvent : (ev as ShouldStartLoadRequest))
              }
              onError={popupOnLoadError}
              onLoad={(ev: WebViewNavigationEvent): void => {
                void popupOnLoadStop(ev);
              }}
              onMessage={(ev: WebViewMessageEvent): void => onMessage(ev, popupCtrl, true)}
              style={{flex: 1}}
            />
          </View>
        </View>
      ) : null}

      {/* Full-screen loader overlay — covers WebView until page is ready. */}
      {f.isLoading ? (
        <View
          pointerEvents="auto"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <ActivityIndicator size="large" color={KycTheme.primary} />
          <View style={{height: 20}} />
          <Text style={{fontSize: 14, fontWeight: '500', color: '#757575'}}>{f.loadingMessage}</Text>
        </View>
      ) : null}

      {/* Error overlay — shown on network failure, resource error, or timeout.
          Sits above the WebView so no partial content is ever visible.
          Does NOT navigate back to HomePage; user can retry from here. */}
      {f.hasError ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
          }}>
          <MaterialIcon name="wifi_off_rounded" size={72} color="#BDBDBD" />
          <View style={{height: 20}} />
          <Text style={{fontSize: 15, fontWeight: '500', color: '#616161', lineHeight: 22.5, textAlign: 'center'}}>
            {f.errorMessage}
          </Text>
          <View style={{height: 28}} />
          <ElevatedButton
            onPress={f.isLoading ? null : () => void retryFromErrorOverlay()}
            backgroundColor={KycTheme.primary}
            foregroundColor="#FFFFFF"
            paddingHorizontal={32}
            paddingVertical={14}
            borderRadius={10}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <MaterialIcon name="refresh_rounded" size={18} color="#FFFFFF" />
              <View style={{width: 8}} />
              <Text style={{fontSize: 15, fontWeight: '600', color: '#FFFFFF'}}>Try Again</Text>
            </View>
          </ElevatedButton>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{flex: 1, backgroundColor: '#FFFFFF'}}>
      {/* AppBar */}
      <View style={{backgroundColor: '#FFFFFF', paddingTop: insets.top}}>
        <View style={{height: 56, flexDirection: 'row', alignItems: 'center'}}>
          <Pressable
            onPress={f.rpdBackLoading ? undefined : () => void handleBackPressed()}
            style={{width: 48, height: 48, marginLeft: 4, alignItems: 'center', justifyContent: 'center'}}>
            {f.rpdBackLoading ? (
              <ActivityIndicator size="small" color={KycTheme.primary} />
            ) : (
              <MaterialIcon name="arrow_back" size={24} color={KycTheme.textPrimary} />
            )}
          </Pressable>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              marginLeft: 8,
              color: KycTheme.textPrimary,
              fontSize: 18,
              fontWeight: '600',
              textAlign: Platform.OS === 'ios' ? 'center' : 'left',
            }}>
            {title}
          </Text>
          <Pressable
            accessibilityLabel="Reload"
            onPress={f.isLoading ? undefined : () => void reloadWebView()}
            style={{width: 48, height: 48, alignItems: 'center', justifyContent: 'center'}}>
            <MaterialIcon name="refresh" size={24} color={KycTheme.textPrimary} />
          </Pressable>
          {isIpvOrFaceFinderUrl(f.currentUrl) ? (
            <Pressable
              accessibilityLabel="Request Permissions"
              onPress={() => {
                f.permissionsRequested = false;
                void requestPermissionsAndReload();
              }}
              style={{width: 48, height: 48, alignItems: 'center', justifyContent: 'center'}}>
              <MaterialIcon name="camera_alt" size={24} color={KycTheme.textPrimary} />
            </Pressable>
          ) : null}
          <View style={{width: 4}} />
        </View>
        {f.isLoading ? <LinearProgress /> : null}
      </View>

      {shouldResizeForKeyboard() ? (
        <KeyboardAvoidingView style={{flex: 1}} behavior="padding">
          {body}
        </KeyboardAvoidingView>
      ) : (
        <View style={{flex: 1}}>{body}</View>
      )}

      {/* ScaffoldMessenger SnackBar */}
      {f.snack != null ? (
        <View
          pointerEvents="none"
          style={{position: 'absolute', left: 12, right: 12, bottom: 28 + insets.bottom}}>
          <View
            style={{
              backgroundColor: f.snack.isError ? '#D32F2F' : KycTheme.primary,
              borderRadius: 4,
              paddingHorizontal: 16,
              paddingVertical: 14,
              elevation: 6,
              shadowColor: '#000000',
              shadowOpacity: 0.2,
              shadowRadius: 6,
              shadowOffset: {width: 0, height: 3},
            }}>
            <Text style={{color: '#FFFFFF', fontSize: 13, lineHeight: 17.55}}>{f.snack.message}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Flutter `LinearProgressIndicator` (indeterminate; primary on border track; 4px high). */
function LinearProgress() {
  const [x] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, {toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true}),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  const barW = width * 0.4;
  const translateX = x.interpolate({inputRange: [0, 1], outputRange: [-barW, width]});
  return (
    <View
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={{height: 4, backgroundColor: KycTheme.border, overflow: 'hidden'}}>
      <Animated.View
        style={{height: 4, width: barW, backgroundColor: KycTheme.primary, transform: [{translateX}]}}
      />
    </View>
  );
}
