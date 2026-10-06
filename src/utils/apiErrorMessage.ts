/** Maps raw API / gateway bodies to short, user-friendly copy. */
export function friendlyApiErrorMessage(
  raw?: string | null,
  options: {statusCode?: number | null} = {},
): string {
  const statusCode = options.statusCode ?? null;
  if (raw == null || raw.trim().length === 0) {
    return defaultForStatus(statusCode);
  }

  const text = raw.trim();
  const lower = text.toLowerCase();

  if (lower.includes('<!doctype') || lower.includes('<html') || lower.includes('<body')) {
    return defaultForStatus(statusCode);
  }

  if (lower.includes('502') || lower.includes('bad gateway')) {
    return 'Our servers are temporarily unavailable. Please wait a moment and tap Try Again.';
  }
  if (lower.includes('503') || lower.includes('service unavailable')) {
    return 'The service is temporarily busy. Please try again in a little while.';
  }
  if (lower.includes('504') || lower.includes('gateway timeout')) {
    return 'The request took too long. Please check your connection and try again.';
  }
  if (lower.includes('internal server error') || statusCode === 500) {
    return 'Something went wrong on our end. Please tap Try Again.';
  }

  if (isTechnicalBackendToken(lower)) {
    return "We couldn't load this step right now. Please tap Try Again.";
  }

  if (text.length > 280 || (text.startsWith('{') && text.endsWith('}'))) {
    return defaultForStatus(statusCode);
  }

  if (looksLikeUserFacingMessage(text)) {
    return text;
  }

  return defaultForStatus(statusCode);
}

function isTechnicalBackendToken(lower: string): boolean {
  if (lower.startsWith('from ')) return true;
  if (lower.includes('render_time_diverge')) return true;
  if (lower.includes('traceback')) return true;
  if (/^[a-z][a-z0-9_]*$/.test(lower)) return true;
  return false;
}

function looksLikeUserFacingMessage(text: string): boolean {
  if (text.includes('<') || text.includes('>')) return false;
  if (isTechnicalBackendToken(text.toLowerCase())) return false;
  if (text.length < 8) return false;
  return text.includes(' ') || text.includes('.');
}

function defaultForStatus(statusCode: number | null): string {
  switch (statusCode) {
    case 502:
      return 'Our servers are temporarily unavailable. Please wait a moment and tap Try Again.';
    case 503:
      return 'The service is temporarily busy. Please try again in a little while.';
    case 504:
      return 'The request took too long. Please check your connection and try again.';
    case 500:
    case 501:
      return 'Something went wrong on our end. Please tap Try Again.';
    case 401:
    case 403:
      return 'Your session may have expired. Please refresh or sign in again.';
    default:
      return 'Something went wrong. Please check your connection and tap Try Again.';
  }
}

/** Backend get-context / process error when uploaded PDF is still locked. */
export function isPdfDocumentEncryptedError(raw?: string | null): boolean {
  if (raw == null || raw.trim().length === 0) return false;
  const lower = raw.toLowerCase();
  return lower.includes('document closed or encrypted') || lower.includes('closed or encrypted');
}

export const kPdfDocumentEncryptedUserMessage =
  'This PDF is password protected or could not be opened. Please upload again and enter the correct password.';

/** get-context / KRA PAN validation failed — keep user on PAN step to retry. */
export function isInvalidPanContextError(raw?: string | null): boolean {
  if (raw == null || raw.trim().length === 0) return false;
  const lower = raw.toLowerCase();
  return (
    lower.includes('invalid pan') ||
    lower.includes('weberr-999') ||
    lower.includes('getpanstatus') ||
    lower.includes('kra_fetch_failed') ||
    (lower.includes('pan') &&
      (lower.includes('format') || lower.includes('invalid') || lower.includes('not valid')))
  );
}

export function invalidPanUserFacingMessage(raw?: string | null): string {
  if (raw == null || raw.trim().length === 0) {
    return 'Invalid PAN. Please enter a valid PAN and try again.';
  }
  const lower = raw.toLowerCase();
  if (lower.includes('invalid pan') || lower.includes('weberr-999')) {
    const trimmed = raw.trim();
    if (trimmed.length <= 120 && !trimmed.startsWith('{')) {
      return trimmed.includes('Invalid PAN') || trimmed.includes('invalid pan')
        ? lower.includes('format')
          ? 'Invalid PAN format. Please enter a valid PAN.'
          : trimmed
        : 'Invalid PAN format. Please enter a valid PAN.';
    }
    return 'Invalid PAN format. Please enter a valid PAN.';
  }
  return friendlyApiErrorMessage(raw);
}
