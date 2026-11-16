/**
 * Environment configuration for API URLs and default workflow.
 * Port of lib/config/env_config.dart
 */
export const EnvConfig = {
  apiUrlLocal: 'https://ekyc.rudrashares.com',
  apiUrl: 'https://ekyc.rudrashares.com',
  ssoSecretKey: '6BLUfSm4Z7SakL1X6nNnMevFwRLxYUzv',

  /** Default company and workflow (static for now) */
  companyName: 'rudra',
  workflowName: 'in_app', // individual

  get baseUrl(): string {
    return EnvConfig.apiUrl;
  },
};
