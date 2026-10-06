/**
 * Environment configuration for API URLs and default workflow.
 * Port of lib/config/env_config.dart
 */
export const EnvConfig = {
  apiUrlLocal: 'https://live.meon.co.in',
  apiUrl: 'https://live.meon.co.in',
  ssoSecretKey: 'IBZmvgxvGUHgxNVpoXoK1c3fFVL76P0j',

  /** LeadSquared proxy - post-SSO lead capture (Meon live API). */
  leadSquaredCaptureUrl: 'https://ekyc.stoxbox.in/leadsquared_api/bp',

  /** Default company and workflow (static for now) */
  companyName: 'TRUEWEALTH',
  workflowName: 'individual', // 'app_test'; individual

  get baseUrl(): string {
    return EnvConfig.apiUrl;
  },
};
