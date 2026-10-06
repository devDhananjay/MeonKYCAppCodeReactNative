import {EnvConfig} from '../config/env';
import {debugPrint} from '../utils/debug';
import {httpPost} from './http';

/** Meon LeadSquared proxy - called before SSO on app load. */
const REQUEST_TIMEOUT_SECONDS = 120;

const UTM_SOURCE = 'App';
const UTM_MEDIUM = 'App';
const UTM_CAMPAIGN = 'In_app_kyc';
const COMM_SOURCE = 'In_app_kyc';
const SOURCE_CONTENT = 'App';

function buildPayloadAttributes(opts: {
  mobileNumber: string;
  firstName?: string;
  ageGroup?: string;
}): Array<{Attribute: string; Value: string}> {
  const firstName = opts.firstName ?? '';
  const ageGroup = opts.ageGroup ?? '';
  return [
    {Attribute: 'SearchBy', Value: 'Phone'},
    {Attribute: 'Phone', Value: opts.mobileNumber},
    {Attribute: 'FirstName', Value: firstName},
    {Attribute: 'mx_Lead_Age_Group', Value: ageGroup},
    {Attribute: 'Source', Value: UTM_SOURCE},
    {Attribute: 'mx_UTMSource', Value: UTM_SOURCE},
    {Attribute: 'SourceMedium', Value: UTM_MEDIUM},
    {Attribute: 'SourceCampaign', Value: UTM_CAMPAIGN},
    {Attribute: 'mx_CommSource', Value: COMM_SOURCE},
    {Attribute: 'mx_Ad_Group', Value: ''},
    {Attribute: 'SourceContent', Value: SOURCE_CONTENT},
  ];
}

function extractLeadId(body: string): string | null {
  try {
    const decoded = JSON.parse(body);
    if (!decoded || typeof decoded !== 'object') return null;
    const data = decoded.data;
    if (!data || typeof data !== 'object') return null;
    const message = data.Message;
    if (!message || typeof message !== 'object') return null;
    const raw = message.RelatedId;
    const id = raw == null ? undefined : String(raw).trim();
    return id == null || id.length === 0 ? null : id;
  } catch (_) {
    return null;
  }
}

function isSuccessResponse(statusCode: number, body: string): boolean {
  if (statusCode < 200 || statusCode >= 300) return false;
  try {
    const decoded = JSON.parse(body);
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return true;
    if (decoded.success === true) return true;
    const data = decoded.data;
    if (
      data &&
      typeof data === 'object' &&
      data.Status != null &&
      String(data.Status).toLowerCase() === 'success'
    ) {
      return true;
    }
    if (decoded.status_code === 200) return true;
  } catch (_) {
    return true;
  }
  return false;
}

export const LeadSquaredAPI = {
  /** SSO `additional_info` keys (different naming than LeadSquared Attribute list). */
  buildSsoAdditionalInfo(opts: {
    mobileNumber: string;
    firstName?: string;
    ageGroup?: string;
  }): Record<string, string> {
    return {
      Phone: opts.mobileNumber,
      firstname: opts.firstName ?? '',
      age_group: opts.ageGroup ?? '',
      source: UTM_SOURCE,
      mx_utmsource: UTM_SOURCE,
      source_medium: UTM_MEDIUM,
      source_campaign: UTM_CAMPAIGN,
      mx_comsource: COMM_SOURCE,
      mx_adgroup: '',
      sourcecontent: SOURCE_CONTENT,
    };
  },

  /** Captures lead and returns `data.Message.RelatedId` for SSO `additional_info.kyc_lead`. */
  async captureLead(opts: {
    mobileNumber: string;
    firstName?: string;
    ageGroup?: string;
  }): Promise<string | null> {
    const url = EnvConfig.leadSquaredCaptureUrl;
    const body = {
      payload: buildPayloadAttributes(opts),
      timeout: REQUEST_TIMEOUT_SECONDS,
    };
    const encodedBody = JSON.stringify(body);

    debugPrint(`[LeadSquared] POST ${url}`);
    debugPrint(`[LeadSquared] payload: ${encodedBody}`);

    try {
      const res = await httpPost(url, {
        headers: {'Content-Type': 'application/json'},
        body: encodedBody,
        timeoutMs: REQUEST_TIMEOUT_SECONDS * 1000,
      });

      debugPrint(`[LeadSquared] response status=${res.statusCode}`);
      debugPrint(`[LeadSquared] response: ${res.body}`);

      if (!isSuccessResponse(res.statusCode, res.body)) {
        return null;
      }

      const leadId = extractLeadId(res.body);
      debugPrint(`[LeadSquared] lead captured RelatedId=${leadId}`);
      return leadId;
    } catch (e) {
      debugPrint(`[LeadSquared] exception: ${e}`);
      return null;
    }
  },
};
