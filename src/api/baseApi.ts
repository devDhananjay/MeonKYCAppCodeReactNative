import {EnvConfig} from '../config/env';
import {StorageService} from '../services/storageService';
import {base64ToBytes, utf8Decode} from '../utils/base64';
import {debugPrint} from '../utils/debug';
import {HttpResponse, httpGet, httpPost} from './http';

type Json = Record<string, any>;

/** Android logcat truncates ~4k/line — chunk so full payloads still appear. */
const LOG_CHUNK = 3500;

function prettyPayload(raw: string | null | undefined): string {
  if (raw == null || raw.length === 0) return '(empty)';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch (_) {
    return raw;
  }
}

function logChunks(prefix: string, text: string): void {
  if (text.length <= LOG_CHUNK) {
    debugPrint(`${prefix}\n${text}`);
    return;
  }
  const total = Math.ceil(text.length / LOG_CHUNK);
  for (let i = 0; i < total; i++) {
    const part = text.substring(i * LOG_CHUNK, (i + 1) * LOG_CHUNK);
    debugPrint(`${prefix} [${i + 1}/${total}]\n${part}`);
  }
}

function log(tag: string, message: string, extra?: string): void {
  if (extra == null) {
    debugPrint(`[API ${tag}] ${message}`);
    return;
  }
  logChunks(`[API ${tag}] ${message}`, extra);
}

/** Reads the JWT payload as a map (null if the token is malformed). */
function jwtPayloadMap(token: string): Json | null {
  const firstDot = token.indexOf('.');
  const secondDot = token.indexOf('.', firstDot + 1);
  if (firstDot <= 0 || secondDot <= firstDot) return null;
  const segment = token.substring(firstDot + 1, secondDot);
  const pad = (4 - (segment.length % 4)) % 4;
  const padded = segment + '='.repeat(pad);
  try {
    const std = padded.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = utf8Decode(base64ToBytes(std));
    const decoded = JSON.parse(jsonStr);
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      return decoded as Json;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function csrfFromAccessToken(token: string): string | null {
  const csrf = jwtPayloadMap(token)?.csrf;
  if (csrf == null) return null;
  const s = String(csrf);
  return s.length === 0 ? null : s;
}

function applyBearerAndCsrf(headers: Record<string, string>, token: string | null): void {
  if (token == null || token.length === 0) return;
  headers.Authorization = `Bearer ${token}`;
  const csrf = csrfFromAccessToken(token);
  if (csrf != null) headers['X-CSRF-TOKEN'] = csrf;
  const sessionId = BaseAPI.sessionIdFromJwtAccessToken(token);
  if (sessionId != null) {
    const existing = headers.Cookie?.trim();
    const sessionCookie = `session_id=${sessionId}`;
    headers.Cookie =
      existing == null || existing.length === 0
        ? sessionCookie
        : `${existing}; ${sessionCookie}`;
  }
}

class BaseAPIClass {
  /**
   * Default timeout for JSON KYC API calls (`get-workflow-details`, `get-context`, etc.).
   * Keep this far below the old 600s so a hung network cannot stick the UI on
   * "Setting up your KYC journey..." indefinitely.
   */
  readonly requestTimeout = 45 * 1000;

  /** Multipart uploads / heavy posts may still need a long window. */
  readonly uploadTimeout = 600 * 1000;

  private get baseUrl(): string {
    return EnvConfig.baseUrl;
  }

  /**
   * Reads [csrf] from JWT payload when present (e.g. Flask-JWT-Extended).
   * Used by ApiClient multipart requests; same header as JSON calls.
   */
  csrfFromJwtAccessToken(token: string): string | null {
    return csrfFromAccessToken(token);
  }

  /** Flask session cookie - web/curl send `session_id=...`; match on mobile JSON calls. */
  sessionIdFromJwtAccessToken(token: string): string | null {
    const sid = jwtPayloadMap(token)?.session_id;
    if (sid == null) return null;
    const s = String(sid).trim();
    return s.length === 0 ? null : s;
  }

  async get(path: string, headers?: Record<string, string>): Promise<HttpResponse> {
    const url = `${this.baseUrl}${path}`;
    log('GET', `Request: ${url}`);
    const token = await StorageService.getAccessToken();
    debugPrint(`[API] Token present: ${token != null && token.length > 0} length=${token?.length ?? 0}`);
    const h: Record<string, string> = {...(headers ?? {}), 'Content-Type': 'application/json'};
    applyBearerAndCsrf(h, token);
    debugPrint(`[API GET] Request headers: ${JSON.stringify(Object.keys(h))}`);
    try {
      const res = await httpGet(url, {headers: h, timeoutMs: this.requestTimeout});
      log('GET', `Response ${res.statusCode}: ${url} (${res.body.length} chars)`, prettyPayload(res.body));
      return res;
    } catch (e) {
      log('GET', `Error: ${url}`, String(e));
      throw e;
    }
  }

  async post(
    path: string,
    options: {body?: any; headers?: Record<string, string>} = {},
  ): Promise<HttpResponse> {
    const {body, headers} = options;
    const url = `${this.baseUrl}${path}`;
    const bodyStr =
      body == null
        ? null
        : typeof body === 'object'
        ? JSON.stringify(body)
        : String(body);
    log('POST', `Request: ${url}`, prettyPayload(bodyStr ?? '{}'));
    const token = await StorageService.getAccessToken();
    debugPrint(`[API] Token present: ${token != null && token.length > 0} length=${token?.length ?? 0}`);
    const h: Record<string, string> = {...(headers ?? {})};
    if (!('Content-Type' in h)) {
      h['Content-Type'] = 'application/json';
    }
    applyBearerAndCsrf(h, token);
    debugPrint(`[API POST] Request headers: ${JSON.stringify(Object.keys(h))}`);
    try {
      const res = await httpPost(url, {
        headers: h,
        body: bodyStr ?? '{}',
        timeoutMs: this.requestTimeout,
      });
      log('POST', `Response ${res.statusCode}: ${path} (${res.body.length} chars)`, prettyPayload(res.body));

      // Extract and log Position from get-context API response
      if (res.statusCode === 200) {
        try {
          const responseData = JSON.parse(res.body);
          if (
            responseData &&
            typeof responseData === 'object' &&
            'context' in responseData
          ) {
            const context = responseData.context;
            if (context && typeof context === 'object' && 'position' in context) {
              debugPrint(`[API] Position extracted: ${context.position}`);
              if (context.page && typeof context.page === 'object') {
                debugPrint(
                  `[API] Page label=${context.page?.data?.label ?? ''} id=${context.page?.id ?? ''} fields=${Array.isArray(context.page?.fields) ? context.page.fields.length : 0}`,
                );
              }
            }
          }
          if (responseData && typeof responseData === 'object' && 'success' in responseData) {
            debugPrint(`[API] success=${String(responseData.success)} msg=${String(responseData.msg ?? responseData.message ?? '')}`);
          }
        } catch (_) {
          // Ignore for responses without JSON context
        }
      }

      return res;
    } catch (e) {
      log('POST', `Error: ${url}`, String(e));
      throw e;
    }
  }
}

export const BaseAPI = new BaseAPIClass();
