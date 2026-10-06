import {EnvConfig} from '../config/env';
import {ApiClient} from './apiClient';
import {HttpResponse, MultipartRequestSpec, encodeComponent} from './http';

function toBody(dataToSend: any): any {
  if (dataToSend != null && typeof dataToSend === 'object') return dataToSend;
  if (typeof dataToSend === 'string') return JSON.parse(dataToSend);
  return dataToSend;
}

/** A picked local file (what Dart's `File` was in the Flutter app). */
export interface LocalFile {
  path: string;
  name?: string;
  mimeType?: string;
}

function isLocalFile(v: any): v is LocalFile {
  return v != null && typeof v === 'object' && typeof v.path === 'string';
}

function buildFinancialRequest(
  url: string,
  dataToSend: Record<string, any>,
): MultipartRequestSpec {
  const request: MultipartRequestSpec = {
    method: 'POST',
    url,
    fields: {},
    files: [],
    headers: {},
  };
  const financial = dataToSend.financial;
  if (isLocalFile(financial)) {
    request.files.push({
      field: 'financial',
      path: financial.path,
      filename: financial.name,
      contentType: financial.mimeType,
    });
  }
  return request;
}

export const KycAPI = {
  submitKyc(
    urlCompany: string,
    urlWorkflowName: string,
    dataToSend: any,
    headers: Record<string, string>,
  ): Promise<HttpResponse> {
    return ApiClient.post(`/api/get-user/${urlCompany}/${urlWorkflowName}`, {
      body: toBody(dataToSend),
      headers,
    });
  },

  /** Backend proxy -> review/edit step for a field; on success client refreshes via get-context. */
  reviewEditPage(
    company: string,
    workflowName: string,
    currentField: string,
  ): Promise<HttpResponse> {
    const c = encodeComponent(company);
    const w = encodeComponent(workflowName);
    const f = encodeComponent(currentField);
    return ApiClient.get(`/api_review_edit_page/${c}/${w}/${f}`);
  },

  submitKycV2(
    urlCompany: string,
    urlWorkflowName: string,
    position: string,
    index: string,
    dataToSend: any,
    headers: Record<string, string>,
  ): Promise<HttpResponse> {
    const body =
      dataToSend != null && typeof dataToSend === 'object'
        ? dataToSend
        : JSON.parse(String(dataToSend));
    return ApiClient.post(
      `/api/kyc-post-v2/${urlCompany}/${urlWorkflowName}/${position}${index}`,
      {body, headers},
    );
  },

  pdfPasswordCheck(
    _urlCompany: string,
    workflowKey: string,
    dataToSend: Record<string, any>,
  ): Promise<HttpResponse> {
    // Match web: /pdfPassCheck/{workflow_Key} (raw key, not double-encoded).
    const url = `${EnvConfig.baseUrl}/pdfPassCheck/${workflowKey}`;
    return ApiClient.postMultipart(async () => buildFinancialRequest(url, dataToSend), {
      skipRefreshOn401: true,
    });
  },

  verifyPdfPassword(
    pdfPassword: string,
    workflowKey: string,
    dataToSend: Record<string, any>,
  ): Promise<HttpResponse> {
    const encodedPassword = encodeComponent(pdfPassword);
    const url = `${EnvConfig.baseUrl}/verifyPdfPassword/${encodedPassword}/${workflowKey}`;
    return ApiClient.postMultipart(async () => buildFinancialRequest(url, dataToSend), {
      skipRefreshOn401: true,
    });
  },

  getUserDetails(): Promise<HttpResponse> {
    return ApiClient.post('/api/user-details', {body: {}});
  },

  positionUpdate(position: string): Promise<HttpResponse> {
    return ApiClient.post('/api/position-update', {body: {position}});
  },

  getStepperWorkflow(company: string, workflowId: string): Promise<HttpResponse> {
    // Admin stepper workflow API (used only for step labels)
    // Backend route (from curl): /kycadmin_getWorkflow/{workflowName}/{workflowId}
    // "company" arg here is actually workflowName (e.g. bp_flow)
    return ApiClient.post(`/kycadmin_getWorkflow/${company}/${workflowId}`, {body: {}});
  },
};
