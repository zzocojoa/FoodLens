export type LoginAuthMode = 'login' | 'signup';
export type LoginOAuthProvider = 'google' | 'kakao';

export type LoginFormValues = {
  email: string;
  password: string;
  confirmPassword: string;
  verificationCode: string;
  rememberMe: boolean;
};

export type LoginPendingEmailVerification = {
  email: string;
  expiresInSeconds: number;
  debugCode?: string;
};

export type LoginPendingPasswordReset = {
  email: string;
  expiresInSeconds: number;
  debugCode?: string;
};

export type LoginAuthCopy = {
  title: string;
  primaryButtonLabel: string;
  switchLeadText: string;
  switchActionText: string;
  nextMode: LoginAuthMode;
};

export type LoginSubmitPayload = {
  mode: LoginAuthMode;
  values: LoginFormValues;
  locale?: string;
};
