/** SSO mobile/email - static for now; replace when host app passes credentials. */
export interface SsoCredentials {
  mobileNumber: string;
  email: string;
}

/** Static SSO credentials (change here or wire from host app later). */
export const kSsoStaticCredentials: SsoCredentials = {
  mobileNumber: '9411441937',
  email: 'dhananjay@meon.co.in',
};

export function resolveSsoCredentials(): SsoCredentials {
  return kSsoStaticCredentials;
}

/** Hide "securely encrypted" footer on host-app onboarding screens. */
export const kHideOnboardingFormFooter = true;
