import {EnvConfig} from '../config/env';
import {StorageService} from '../services/storageService';
import {debugPrint} from '../utils/debug';
import {Fluttertoast} from '../utils/toast';
import {BaseAPI} from './baseApi';
import {HttpResponse, httpPost} from './http';

let isRefreshing = false;
const onRefreshComplete: Array<() => void> = [];

function waitForRefresh(): Promise<void> {
  return new Promise<void>(resolve => {
    onRefreshComplete.push(() => resolve());
  });
}

async function refreshToken(): Promise<boolean> {
  const refresh = await StorageService.getRefreshToken();
  if (refresh == null || refresh.length === 0) {
    debugPrint('[ApiInterceptor] No refresh token in storage - cannot refresh');
    return false;
  }

  const url = `${EnvConfig.baseUrl}/api/user/refresh`;
  debugPrint(`[ApiInterceptor] Calling refresh API: ${url}`);
  const res = await httpPost(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refresh}`,
    },
    timeoutMs: BaseAPI.requestTimeout,
  });

  debugPrint(`[ApiInterceptor] Refresh API response: ${res.statusCode}`);
  debugPrint(`[ApiInterceptor] Refresh response body:\n${res.body}`);
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    debugPrint(`[ApiInterceptor] Refresh failed status=${res.statusCode}`);
    return false;
  }

  let data: Record<string, any> | null = null;
  try {
    const parsed = JSON.parse(res.body);
    data = parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    debugPrint(`[ApiInterceptor] Refresh response parse error: ${e}`);
    return false;
  }

  // Support both "access_token" and "token" keys
  const asStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const accessToken = asStr(data?.access_token) ?? asStr(data?.token);
  const newRefresh = asStr(data?.refresh_token) ?? asStr(data?.refresh);

  if (accessToken != null && accessToken.length > 0) {
    await StorageService.setAccessToken(accessToken);
    if (newRefresh != null && newRefresh.length > 0) {
      await StorageService.setRefreshToken(newRefresh);
    }
    debugPrint('[ApiInterceptor] New access token stored successfully');
    return true;
  }
  debugPrint('[ApiInterceptor] Refresh response missing access_token/token');
  return false;
}

export const ApiInterceptor = {
  async request(fn: () => Promise<HttpResponse>): Promise<HttpResponse> {
    let response = await fn();
    debugPrint(`[ApiInterceptor] Response status: ${response.statusCode}`);
    if (response.statusCode === 401 || response.statusCode === 422) {
      debugPrint('[ApiInterceptor] 401/422 - token expired or invalid, attempting refresh');
      if (isRefreshing) {
        debugPrint('[ApiInterceptor] Refresh already in progress - waiting then retrying');
        await waitForRefresh();
        return fn();
      }
      isRefreshing = true;
      try {
        const refreshed = await refreshToken();
        if (refreshed) {
          debugPrint('[ApiInterceptor] Refresh success - retrying original request with new token');
          response = await fn();
          debugPrint(`[ApiInterceptor] Retry response status: ${response.statusCode}`);
        } else {
          debugPrint('[ApiInterceptor] Refresh failed - clearing session');
          await StorageService.clearAll();
          Fluttertoast.showToast({
            msg: 'Session expired. Please sign in again.',
            gravity: 'TOP',
          });
        }
      } catch (e) {
        debugPrint(`[ApiInterceptor] Refresh exception: ${e}`);
        await StorageService.clearAll();
        Fluttertoast.showToast({
          msg: 'Session expired. Please sign in again.',
          gravity: 'TOP',
        });
        throw e;
      } finally {
        isRefreshing = false;
        for (const cb of onRefreshComplete) cb();
        onRefreshComplete.length = 0;
      }
    }
    return response;
  },
};
