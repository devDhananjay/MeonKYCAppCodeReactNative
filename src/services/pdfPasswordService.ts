import {HttpResponse} from '../api/http';
import {KycAPI, LocalFile} from '../api/kycApi';
import {delay, isMap, toStr} from '../utils/dartHelpers';
import {debugPrint} from '../utils/debug';

export enum PdfPasswordCheckStatus {
  notEncrypted = 'notEncrypted',
  encrypted = 'encrypted',
  corrupted = 'corrupted',
  error = 'error',
}

export interface PdfPasswordCheckResult {
  status: PdfPasswordCheckStatus;
  message: string;
}

export interface PdfPasswordVerifyResult {
  success: boolean;
  message: string;
}

const _maxTransientRetries = 3;

function _isTransientStatus(statusCode: number): boolean {
  return statusCode === 403 || statusCode === 429 || statusCode === 502 || statusCode === 503;
}

function _looksLikeTransientHtml(body: string): boolean {
  const t = body.toLowerCase();
  return (
    t.includes('processing your journey') ||
    t.includes('syncing your progress') ||
    t.includes('<!doctype html')
  );
}

function _preview(body: string): string {
  return body.length > 400 ? `${body.substring(0, 400)}...` : body;
}

async function _checkWithRetry(
  file: LocalFile,
  workflowKey: string,
  urlCompany?: string | null,
): Promise<HttpResponse> {
  let last: HttpResponse | undefined;
  for (let attempt = 1; attempt <= _maxTransientRetries; attempt++) {
    last = await KycAPI.pdfPasswordCheck(urlCompany ?? '', workflowKey, {financial: file});
    debugPrint(`[PdfPassword] check attempt=${attempt}/${_maxTransientRetries} status=${last.statusCode}`);
    if (!_isTransientStatus(last.statusCode)) return last;
    if (attempt < _maxTransientRetries) {
      const waitSec = attempt + 1;
      debugPrint(`[PdfPassword] transient ${last.statusCode} - retry in ${waitSec}s`);
      await delay(waitSec * 1000);
    }
  }
  return last as HttpResponse;
}

function _parseCheckResponse(res: HttpResponse): PdfPasswordCheckResult {
  debugPrint(`[PdfPassword] check status=${res.statusCode} body=${_preview(res.body)}`);

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const transient = _isTransientStatus(res.statusCode) || _looksLikeTransientHtml(res.body);
    return {
      status: PdfPasswordCheckStatus.error,
      message: transient
        ? 'Server is busy verifying the PDF. Please try uploading again in a moment.'
        : 'Could not check PDF password protection. Please try again.',
    };
  }

  try {
    const decoded = JSON.parse(res.body);
    if (!isMap(decoded)) {
      // 2xx but not JSON map - treat as not encrypted (web else-branch).
      return {status: PdfPasswordCheckStatus.notEncrypted, message: ''};
    }

    const data = decoded.data === true;
    const info = decoded.info == null ? '' : toStr(decoded.info).toLowerCase();
    const msg = decoded.msg == null ? '' : toStr(decoded.msg);

    if (data && info === 'corrupted') {
      return {
        status: PdfPasswordCheckStatus.corrupted,
        message: msg.length > 0 ? msg : 'Your file is corrupted. Please upload a valid file.',
      };
    }
    if (data && info === 'encrypted') {
      return {status: PdfPasswordCheckStatus.encrypted, message: msg};
    }
    return {status: PdfPasswordCheckStatus.notEncrypted, message: ''};
  } catch (_) {
    // HTML/non-JSON 2xx - not encrypted.
    return {status: PdfPasswordCheckStatus.notEncrypted, message: ''};
  }
}

/** Global helpers for PDF password-protection check / verify (web JS parity). */
export const PdfPasswordService = {
  isPdfFile(file: LocalFile): boolean {
    return file.path.toLowerCase().endsWith('.pdf');
  },

  async checkEncrypted(opts: {
    file: LocalFile;
    workflowKey: string;
    urlCompany?: string | null;
  }): Promise<PdfPasswordCheckResult> {
    try {
      const res = await _checkWithRetry(opts.file, opts.workflowKey, opts.urlCompany);
      return _parseCheckResponse(res);
    } catch (e) {
      debugPrint(`[PdfPassword] check exception: ${e}`);
      return {
        status: PdfPasswordCheckStatus.error,
        message: 'Could not check PDF password protection. Please try again.',
      };
    }
  },

  async verifyPassword(opts: {
    file: LocalFile;
    password: string;
    workflowKey: string;
  }): Promise<PdfPasswordVerifyResult> {
    try {
      let last: HttpResponse | undefined;
      for (let attempt = 1; attempt <= _maxTransientRetries; attempt++) {
        last = await KycAPI.verifyPdfPassword(opts.password, opts.workflowKey, {
          financial: opts.file,
        });
        debugPrint(
          `[PdfPassword] verify attempt=${attempt}/${_maxTransientRetries} status=${last.statusCode}`,
        );
        if (!_isTransientStatus(last.statusCode)) break;
        if (attempt < _maxTransientRetries) {
          await delay((attempt + 1) * 1000);
        }
      }
      const res = last as HttpResponse;
      debugPrint(`[PdfPassword] verify status=${res.statusCode} body=${_preview(res.body)}`);

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return {
          success: false,
          message: _isTransientStatus(res.statusCode)
            ? 'Server is busy. Please try verifying again in a moment.'
            : 'Password verification failed. Please try again.',
        };
      }

      const decoded = JSON.parse(res.body);
      if (!isMap(decoded)) {
        return {success: true, message: ''};
      }

      if (decoded.success === false || decoded.data === false) {
        const msg =
          decoded.msg != null
            ? toStr(decoded.msg)
            : decoded.message != null
            ? toStr(decoded.message)
            : 'Incorrect password. Please try again.';
        return {success: false, message: msg};
      }

      const info = decoded.info == null ? '' : toStr(decoded.info).toLowerCase();
      if (info === 'encrypted' && decoded.data === true) {
        return {
          success: false,
          message: decoded.msg != null ? toStr(decoded.msg) : 'Incorrect password. Please try again.',
        };
      }

      return {success: true, message: ''};
    } catch (e) {
      debugPrint(`[PdfPassword] verify exception: ${e}`);
      return {success: false, message: 'Password verification failed. Please try again.'};
    }
  },
};
