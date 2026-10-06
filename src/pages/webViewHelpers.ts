import {NativeModules, Platform} from 'react-native';
import {debugPrint} from '../utils/debug';

/** Set true only when debugging WebView navigation noise. */
export const kWebViewVerboseLogs = false;

export const kGooglePayPackage = 'com.google.android.apps.nbu.paisa.user';

export function wvLog(message: string): void {
  if (__DEV__ && kWebViewVerboseLogs) {
    debugPrint(message);
  }
}

export function paymentLog(message: string): void {
  if (__DEV__) {
    debugPrint(`[Payment] ${message}`);
  }
}

export function isPaymentDeepLink(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.startsWith('upi://') ||
    lower.startsWith('intent:') ||
    lower.startsWith('phonepe://') ||
    lower.startsWith('paytmmp://') ||
    lower.startsWith('paytm://') ||
    lower.startsWith('gpay://') ||
    lower.startsWith('tez://') ||
    lower.startsWith('google.payments://') ||
    lower.startsWith('googlepay://') ||
    lower.startsWith('bhim://') ||
    lower.startsWith('ppe://')
  );
}

export function extractIntentPackage(url: string): string | null {
  const match = /package=([^;]+)/i.exec(url);
  const g = match?.[1];
  return g == null ? null : g.trim();
}

interface PaymentNative {
  launchIntentUrl(intentUrl: string): Promise<boolean>;
  launchUpi(dataUri: string, packageName: string | null): Promise<boolean>;
}

function paymentNative(): PaymentNative | null {
  return (NativeModules.PaymentModule as PaymentNative | undefined) ?? null;
}

export async function launchIntentUrlNative(intentUrl: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const mod = paymentNative();
    if (mod == null) return false;
    const ok = await mod.launchIntentUrl(intentUrl);
    return ok === true;
  } catch (e) {
    paymentLog(`Intent.parseUri failed: ${e}`);
    return false;
  }
}

export async function launchPaymentUriNative(opts: {
  dataUri: string;
  packageName?: string | null;
}): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const mod = paymentNative();
    if (mod == null) return false;
    const ok = await mod.launchUpi(opts.dataUri, opts.packageName ?? null);
    return ok === true;
  } catch (e) {
    paymentLog(`Native launch failed: ${e}`);
    return false;
  }
}

export interface ParsedAndroidPaymentIntent {
  dataUri: string;
  packageName: string | null;
}

export function parseAndroidPaymentIntentUrl(url: string): ParsedAndroidPaymentIntent | null {
  const lower = url.toLowerCase();
  if (!lower.startsWith('intent:')) return null;

  let body = url.substring('intent:'.length);
  let fragment = '';
  const marker = '#Intent';
  const markerIndex = body.indexOf(marker);
  if (markerIndex !== -1) {
    fragment = body.substring(markerIndex + marker.length);
    body = body.substring(0, markerIndex);
  }

  let scheme: string | null = null;
  let packageName: string | null = null;
  for (const part of fragment.split(';')) {
    const segment = part.trim();
    if (segment.length === 0 || segment === 'end') continue;
    const segmentLower = segment.toLowerCase();
    if (segmentLower.startsWith('scheme=')) {
      scheme = segment.substring('scheme='.length).trim();
    } else if (segmentLower.startsWith('package=')) {
      packageName = segment.substring('package='.length).trim();
    }
  }

  body = body.replace(/;+$/, '').trim();
  if (body.length === 0) return null;

  let dataUri: string;
  if (body.includes('://')) {
    dataUri = body;
  } else if (body.startsWith('//')) {
    dataUri = `${scheme ?? 'upi'}:${body}`;
  } else {
    dataUri = `${scheme ?? 'upi'}://${body}`;
  }

  return {dataUri, packageName};
}

export function packageForPaymentUri(dataUri: string): string | null {
  const lower = dataUri.toLowerCase();
  if (
    lower.startsWith('tez://') ||
    lower.startsWith('gpay://') ||
    lower.startsWith('google.payments://') ||
    lower.startsWith('googlepay://')
  ) {
    return kGooglePayPackage;
  }
  if (lower.startsWith('phonepe://') || lower.startsWith('ppe://')) {
    return 'com.phonepe.app';
  }
  if (lower.startsWith('paytm://') || lower.startsWith('paytmmp://')) {
    return 'net.one97.paytm';
  }
  if (lower.startsWith('bhim://')) {
    return 'in.org.npci.upiapp';
  }
  return null;
}

/** Returns true if the URL should be opened outside the WebView (UPI apps, wallets, tel:, mailto:, etc.) */
export function shouldHandleExternally(url: string): boolean {
  const externalSchemes = [
    'upi://',
    'paytmmp://',
    'paytm://',
    // Digio sometimes uses custom "ppe://" scheme for PhonePe.
    // Treat it as external so we can remap to "phonepe://" later.
    'ppe://',
    'phonepe://',
    'gpay://',
    'tez://',
    'google.payments://',
    'googlepay://',
    'bhim://',
    'tel:',
    'mailto:',
    'whatsapp://',
    'intent:',
    'intent://',
  ];
  const lower = url.toLowerCase();
  return externalSchemes.some(scheme => lower.startsWith(scheme));
}

export function sanitizeDownloadFilename(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'kyc_esign_document.pdf';
  // eslint-disable-next-line no-control-regex
  return trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
}
