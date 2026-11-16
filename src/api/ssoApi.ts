import {EnvConfig} from '../config/env';
import {debugPrint} from '../utils/debug';
import {BaseAPI} from './baseApi';
import {httpPost} from './http';

export interface SsoTokenResult {
  accessToken: string;
  refreshToken: string;
}

const SSO_ROUTE_PATH = '/get_sso_route';

// Kept for parity with the Dart source (unused there as well).
export const SSO_CONTAINER_KEYS = ['data', 'result', 'payload', 'session', 'auth'];

const ACCESS_TOKEN_KEYS = ['access_token', 'token'];
const REFRESH_TOKEN_KEYS = ['refresh_token', 'refresh'];

function isPlainMap(v: unknown): v is Record<string, any> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function extractStringFromMap(map: Record<string, any>, keys: string[]): string | null {
  for (const k of keys) {
    const v = map[k];
    if (v == null) continue;
    const s = String(v);
    if (s.length > 0) return s;
  }
  return null;
}

function extractTokenRecursive(node: unknown, tokenKeys: string[]): string | null {
  if (isPlainMap(node)) {
    const direct = extractStringFromMap(node, tokenKeys);
    if (direct != null) return direct;
    for (const v of Object.values(node)) {
      const found = extractTokenRecursive(v, tokenKeys);
      if (found != null) return found;
    }
    return null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractTokenRecursive(item, tokenKeys);
      if (found != null) return found;
    }
    return null;
  }
  return null;
}

function extractToken(root: Record<string, any>, tokenKeys: string[]): string | null {
  // First pass: direct keys at the root.
  const direct = extractStringFromMap(root, tokenKeys);
  if (direct != null) return direct;
  // Second pass: recursive search through nested objects/arrays.
  return extractTokenRecursive(root, tokenKeys);
}

export const SsoAPI = {
  async getSsoRouteTokens(opts: {
    company: string;
    workflowName: string;
    mobileNumber: string;
    email: string;
    firstName?: string;
    ageGroup?: string;
  }): Promise<SsoTokenResult | null> {
    const {company, workflowName, mobileNumber, email} = opts;
    const firstName = opts.firstName ?? '';
    const ageGroup = opts.ageGroup ?? '';
    const url = `${EnvConfig.baseUrl}${SSO_ROUTE_PATH}`;

    const body: Record<string, any> = {
      company,
      workflowName,
      generate_access_token: true,
      skip_reverification: true,
      secret_key: EnvConfig.ssoSecretKey,
      notification: false,
      unique_keys: {
        mobile_number: mobileNumber,
        // Keep exact key name from provided curl.
        select_dependancy: 'Self',
      },
      additional_info: {
        email,
        Phone: mobileNumber,
        firstname: firstName,
        age_group: ageGroup,
        source: 'App',
        mx_utmsource: 'App',
        source_medium: 'App',
        source_campaign: 'In_app_kyc',
        mx_comsource: 'In_app_kyc',
        mx_adgroup: '',
        sourcecontent: 'App',
      },
      temp_data: {
        is_sso: 'yes',
      },
    };

    debugPrint(`[SSO] Calling get_sso_route for ${company} / ${workflowName}`);
    debugPrint(`[SSO] additional_info payload: ${JSON.stringify(body.additional_info)}`);
    debugPrint(`[SSO] Request payload: ${JSON.stringify(body)}`);

    try {
      // Keep SSO short so a hung get_sso_route cannot block the KYC setup loader.
      const res = await httpPost(url, {
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        timeoutMs: Math.min(BaseAPI.requestTimeout, 15_000),
      });

      debugPrint(`[SSO] get_sso_route response status=${res.statusCode}`);

      if (res.statusCode < 200 || res.statusCode >= 300) {
        debugPrint(
          `[SSO] get_sso_route failed: ${
            res.body.length > 600 ? res.body.substring(0, 600) + '...' : res.body
          }`,
        );
        return null;
      }

      const decoded = JSON.parse(res.body);
      if (!isPlainMap(decoded)) {
        debugPrint(`[SSO] Unexpected response shape: ${typeof decoded}`);
        return null;
      }

      debugPrint(`[SSO] get_sso_route response decoded keys: ${JSON.stringify(Object.keys(decoded))}`);

      const accessToken = extractToken(decoded, ACCESS_TOKEN_KEYS);
      const refreshToken = extractToken(decoded, REFRESH_TOKEN_KEYS);

      if (accessToken == null || refreshToken == null) {
        debugPrint(
          `[SSO] Tokens missing. accessToken=${accessToken != null} refreshToken=${refreshToken != null}`,
        );
        return null;
      }

      debugPrint(
        `[SSO] Tokens extracted. accessTokenLen=${accessToken.length} refreshTokenLen=${refreshToken.length}`,
      );

      return {accessToken, refreshToken};
    } catch (e) {
      debugPrint(`[SSO] Exception in getSsoRouteTokens: ${e}`);
      return null;
    }
  },
};
