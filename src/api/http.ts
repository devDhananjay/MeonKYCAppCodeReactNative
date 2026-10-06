/**
 * Thin fetch wrapper that mimics the `http.Response` surface used by the
 * Flutter app (statusCode + body string) so the ported logic stays 1:1.
 */
export interface HttpResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutException';
  }
}

export interface MultipartFileSpec {
  field: string;
  /** Local file path or file:// uri */
  path: string;
  filename?: string;
  contentType?: string;
}

export interface MultipartRequestSpec {
  method: 'POST';
  url: string;
  fields: Record<string, string>;
  files: MultipartFileSpec[];
  headers: Record<string, string>;
}

function headersToRecord(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new TimeoutError(`Future not completed in ${ms}ms`));
    }, ms);
    promise.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      e => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function httpRequest(
  method: 'GET' | 'POST',
  url: string,
  options: {
    headers?: Record<string, string>;
    body?: string | FormData;
    timeoutMs?: number;
  } = {},
): Promise<HttpResponse> {
  const controller = new AbortController();
  const run = async (): Promise<HttpResponse> => {
    const res = await fetch(url, {
      method,
      headers: options.headers,
      body: options.body as any,
      signal: controller.signal,
    });
    const text = await res.text();
    return {
      statusCode: res.status,
      body: text,
      headers: headersToRecord(res.headers),
    };
  };
  if (options.timeoutMs && options.timeoutMs > 0) {
    return withTimeout(run(), options.timeoutMs, () => controller.abort());
  }
  return run();
}

export function httpGet(
  url: string,
  options: {headers?: Record<string, string>; timeoutMs?: number} = {},
): Promise<HttpResponse> {
  return httpRequest('GET', url, options);
}

export function httpPost(
  url: string,
  options: {
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<HttpResponse> {
  return httpRequest('POST', url, options);
}

export async function sendMultipart(
  spec: MultipartRequestSpec,
  timeoutMs?: number,
): Promise<HttpResponse> {
  const form = new FormData();
  Object.keys(spec.fields).forEach(k => {
    form.append(k, spec.fields[k]);
  });
  spec.files.forEach(f => {
    const uri = f.path.startsWith('file://') || f.path.includes('://') ? f.path : `file://${f.path}`;
    const name = f.filename || f.path.split('/').pop() || 'file';
    form.append(f.field, {
      uri,
      name,
      type: f.contentType || 'application/octet-stream',
    } as any);
  });
  // Do NOT set Content-Type: fetch adds the multipart boundary itself.
  const headers = {...spec.headers};
  Object.keys(headers).forEach(k => {
    if (k.toLowerCase() === 'content-type') delete headers[k];
  });
  return httpRequest('POST', spec.url, {headers, body: form, timeoutMs});
}

/** Dart: Uri.encodeComponent (same unreserved set as JS encodeURIComponent). */
export function encodeComponent(s: string): string {
  return encodeURIComponent(s);
}
