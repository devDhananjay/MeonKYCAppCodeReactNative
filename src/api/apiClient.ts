import {StorageService} from '../services/storageService';
import {debugPrint} from '../utils/debug';
import {BaseAPI} from './baseApi';
import {
  HttpResponse,
  MultipartRequestSpec,
  TimeoutError,
  sendMultipart,
} from './http';
import {ApiInterceptor} from './interceptor';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

class ApiClientClass {
  get(path: string): Promise<HttpResponse> {
    return ApiInterceptor.request(() => BaseAPI.get(path));
  }

  post(
    path: string,
    options: {body?: any; headers?: Record<string, string>} = {},
  ): Promise<HttpResponse> {
    return ApiInterceptor.request(() => BaseAPI.post(path, options));
  }

  /**
   * Sends a multipart request. [createRequest] is called each time (e.g. on retry after 401)
   * so that a fresh request is built and the latest token from storage is used.
   * Set [skipRefreshOn401] to true for endpoints like upload_files where 401 should not
   * trigger token refresh (same token as other APIs is used; no retry/refresh).
   */
  async postMultipart(
    createRequest: () => Promise<MultipartRequestSpec>,
    options: {skipRefreshOn401?: boolean} = {},
  ): Promise<HttpResponse> {
    const skipRefreshOn401 = options.skipRefreshOn401 ?? false;

    const send = async (): Promise<HttpResponse> => {
      const request = await createRequest();
      const url = request.url;
      debugPrint(`[API MULTIPART] Request: ${url}`);
      debugPrint(`[API MULTIPART] fields: ${JSON.stringify(request.fields)}`);
      const token = await StorageService.getAccessToken();
      if (token != null) {
        request.headers.Authorization = `Bearer ${token}`;
        const csrf = BaseAPI.csrfFromJwtAccessToken(token);
        if (csrf != null) request.headers['X-CSRF-TOKEN'] = csrf;
        const sessionId = BaseAPI.sessionIdFromJwtAccessToken(token);
        if (sessionId != null) {
          request.headers.Cookie = `session_id=${sessionId}`;
        }
        debugPrint(`[API MULTIPART] Authorization header set (token length: ${token.length})`);
      } else {
        debugPrint('[API MULTIPART] WARNING: No access token in storage');
      }
      try {
        const res = await sendMultipart(request, BaseAPI.uploadTimeout);
        const bodyPreview =
          res.body.length > 600 ? `${res.body.substring(0, 600)}...` : res.body;
        debugPrint(`[API MULTIPART] Response ${res.statusCode}: ${url}\n${bodyPreview}`);
        return res;
      } catch (e) {
        debugPrint(`[API MULTIPART] Error: ${url}\n${e}`);
        throw e;
      }
    };

    if (skipRefreshOn401) {
      return withTimeout(send(), BaseAPI.uploadTimeout);
    }
    return withTimeout(ApiInterceptor.request(send), BaseAPI.uploadTimeout);
  }
}

export const ApiClient = new ApiClientClass();
