import { LoginFormValues } from '../types/login.types';

export const LOGIN_COLORS = {
  appBackground: '#f3f4f6',
  phoneBackground: '#ffffff',
  textPrimary: '#333333',
  textSecondary: '#a0a0a0',
  accent: '#ff8a8a',
  border: '#e5e5e5',
  inputIcon: '#a0a0a0',
  inputPipe: '#cccccc',
  indicator: '#333333',
  shadow: 'rgba(0, 0, 0, 0.25)',
  accentShadow: 'rgba(255, 138, 138, 0.4)',
  white: '#ffffff',
} as const;

export const LOGIN_COPY = {
  welcomeTitle: 'Welcome',
  welcomeDescriptionLine1: 'Lorem ipsum dolor sit amet consectetur.',
  welcomeDescriptionLine2: 'Lorem id sit',
  continueLabel: 'Continue',
  emailLabel: 'Email',
  emailPlaceholder: 'example@email.com',
  passwordLabel: 'Password',
  passwordPlaceholder: 'enter your password',
  confirmPasswordLabel: 'Confirm Password',
  confirmPasswordPlaceholder: 'Confirm your password',
  verificationCodeLabel: 'Verification Code',
  verificationCodePlaceholder: 'Enter 6-digit code',
  rememberMe: 'Remember Me',
  forgotPassword: 'Forgot Password?',
  loginTitle: 'Sign in',
  signupTitle: 'Sign up',
  resetPasswordTitle: 'Reset Password',
  loginPrimaryButton: 'Login',
  signupPrimaryButton: 'Create Account',
  verifyEmailPrimaryButton: 'Verify Email',
  resetPasswordPrimaryButton: 'Reset Password',
  resetPasswordBackToSignIn: 'Back to Sign in',
  newPasswordLabel: 'New Password',
  newPasswordPlaceholder: 'enter your new password',
  confirmNewPasswordLabel: 'Confirm New Password',
  confirmNewPasswordPlaceholder: 'confirm your new password',
  oauthDividerText: 'Or continue with',
  oauthGoogleButton: 'Continue with Google',
  oauthKakaoButton: 'Continue with Kakao',
  oauthGoogleHint: 'Sign in using your Google account.',
  oauthKakaoHint: 'Sign in using your Kakao account.',
  loginSwitchLead: "Don't have an Account ?",
  signupSwitchLead: 'Already have an Account!',
  loginSwitchAction: 'Sign up',
  signupSwitchAction: 'Login',
  invalidEmailOrPassword: 'Enter a valid email and a password with at least 8 characters.',
  passwordMismatch: 'Passwords do not match.',
  emailVerificationSent: 'Verification code sent. Check your email inbox.',
  emailNotVerified: 'Please verify your email before logging in.',
  invalidVerificationCode: 'Enter the verification code sent to your email.',
  verificationCodeRejected: 'Verification code is invalid or expired.',
  verificationDeliveryFailed: 'Could not send verification email. Please try again shortly.',
  passwordResetCodeSent: 'Password reset code sent. Enter the code and your new password.',
  passwordResetRequestAccepted: 'If an account exists, a password reset code has been sent.',
  passwordResetSuccess: 'Password reset complete. Sign in with your new password.',
  passwordResetCodeRejected: 'Password reset code is invalid or expired.',
  passwordResetDeliveryFailed: 'Could not send password reset email. Please try again shortly.',
  passwordResetInvalidPassword: 'Enter a new password with at least 8 characters.',
  passwordResetPasswordMismatch: 'New password and confirm password do not match.',
  genericAuthFailure: 'Authentication failed. Please try again.',
} as const;

export type LoginCopy = { [K in keyof typeof LOGIN_COPY]: string };

export const createLoginCopy = (
  translate: (key: string, fallback?: string) => string
): LoginCopy => ({
  welcomeTitle: translate('login.welcome.title', LOGIN_COPY.welcomeTitle),
  welcomeDescriptionLine1: translate('login.welcome.description.line1', LOGIN_COPY.welcomeDescriptionLine1),
  welcomeDescriptionLine2: translate('login.welcome.description.line2', LOGIN_COPY.welcomeDescriptionLine2),
  continueLabel: translate('login.welcome.continue', LOGIN_COPY.continueLabel),
  emailLabel: translate('login.form.email.label', LOGIN_COPY.emailLabel),
  emailPlaceholder: translate('login.form.email.placeholder', LOGIN_COPY.emailPlaceholder),
  passwordLabel: translate('login.form.password.label', LOGIN_COPY.passwordLabel),
  passwordPlaceholder: translate('login.form.password.placeholder', LOGIN_COPY.passwordPlaceholder),
  confirmPasswordLabel: translate('login.form.passwordConfirm.label', LOGIN_COPY.confirmPasswordLabel),
  confirmPasswordPlaceholder: translate('login.form.passwordConfirm.placeholder', LOGIN_COPY.confirmPasswordPlaceholder),
  verificationCodeLabel: translate('login.form.verificationCode.label', LOGIN_COPY.verificationCodeLabel),
  verificationCodePlaceholder: translate('login.form.verificationCode.placeholder', LOGIN_COPY.verificationCodePlaceholder),
  rememberMe: translate('login.form.rememberMe', LOGIN_COPY.rememberMe),
  forgotPassword: translate('login.form.forgotPassword', LOGIN_COPY.forgotPassword),
  loginTitle: translate('login.title.signIn', LOGIN_COPY.loginTitle),
  signupTitle: translate('login.title.signUp', LOGIN_COPY.signupTitle),
  resetPasswordTitle: translate('login.title.resetPassword', LOGIN_COPY.resetPasswordTitle),
  loginPrimaryButton: translate('login.action.login', LOGIN_COPY.loginPrimaryButton),
  signupPrimaryButton: translate('login.action.createAccount', LOGIN_COPY.signupPrimaryButton),
  verifyEmailPrimaryButton: translate('login.action.verifyEmail', LOGIN_COPY.verifyEmailPrimaryButton),
  resetPasswordPrimaryButton: translate('login.action.resetPassword', LOGIN_COPY.resetPasswordPrimaryButton),
  resetPasswordBackToSignIn: translate('login.action.backToSignIn', LOGIN_COPY.resetPasswordBackToSignIn),
  newPasswordLabel: translate('login.form.newPassword.label', LOGIN_COPY.newPasswordLabel),
  newPasswordPlaceholder: translate('login.form.newPassword.placeholder', LOGIN_COPY.newPasswordPlaceholder),
  confirmNewPasswordLabel: translate('login.form.newPasswordConfirm.label', LOGIN_COPY.confirmNewPasswordLabel),
  confirmNewPasswordPlaceholder: translate('login.form.newPasswordConfirm.placeholder', LOGIN_COPY.confirmNewPasswordPlaceholder),
  oauthDividerText: translate('login.oauth.divider', LOGIN_COPY.oauthDividerText),
  oauthGoogleButton: translate('login.oauth.google.label', LOGIN_COPY.oauthGoogleButton),
  oauthKakaoButton: translate('login.oauth.kakao.label', LOGIN_COPY.oauthKakaoButton),
  oauthGoogleHint: translate('login.oauth.google.hint', LOGIN_COPY.oauthGoogleHint),
  oauthKakaoHint: translate('login.oauth.kakao.hint', LOGIN_COPY.oauthKakaoHint),
  loginSwitchLead: translate('login.switch.login.lead', LOGIN_COPY.loginSwitchLead),
  signupSwitchLead: translate('login.switch.signup.lead', LOGIN_COPY.signupSwitchLead),
  loginSwitchAction: translate('login.switch.login.action', LOGIN_COPY.loginSwitchAction),
  signupSwitchAction: translate('login.switch.signup.action', LOGIN_COPY.signupSwitchAction),
  invalidEmailOrPassword: translate('login.error.invalidEmailOrPassword', LOGIN_COPY.invalidEmailOrPassword),
  passwordMismatch: translate('login.error.passwordMismatch', LOGIN_COPY.passwordMismatch),
  emailVerificationSent: translate('login.info.emailVerificationSent', LOGIN_COPY.emailVerificationSent),
  emailNotVerified: translate('login.error.emailNotVerified', LOGIN_COPY.emailNotVerified),
  invalidVerificationCode: translate('login.error.invalidVerificationCode', LOGIN_COPY.invalidVerificationCode),
  verificationCodeRejected: translate('login.error.verificationCodeRejected', LOGIN_COPY.verificationCodeRejected),
  verificationDeliveryFailed: translate('login.error.verificationDeliveryFailed', LOGIN_COPY.verificationDeliveryFailed),
  passwordResetCodeSent: translate('login.info.passwordResetCodeSent', LOGIN_COPY.passwordResetCodeSent),
  passwordResetRequestAccepted: translate(
    'login.info.passwordResetRequestAccepted',
    LOGIN_COPY.passwordResetRequestAccepted
  ),
  passwordResetSuccess: translate('login.info.passwordResetSuccess', LOGIN_COPY.passwordResetSuccess),
  passwordResetCodeRejected: translate('login.error.passwordResetCodeRejected', LOGIN_COPY.passwordResetCodeRejected),
  passwordResetDeliveryFailed: translate(
    'login.error.passwordResetDeliveryFailed',
    LOGIN_COPY.passwordResetDeliveryFailed
  ),
  passwordResetInvalidPassword: translate(
    'login.error.passwordResetInvalidPassword',
    LOGIN_COPY.passwordResetInvalidPassword
  ),
  passwordResetPasswordMismatch: translate(
    'login.error.passwordResetPasswordMismatch',
    LOGIN_COPY.passwordResetPasswordMismatch
  ),
  genericAuthFailure: translate('login.error.genericAuthFailure', LOGIN_COPY.genericAuthFailure),
});

export const LOGIN_LAYOUT = {
  phoneMaxWidth: 375,
  phoneMaxHeight: 812,
  statusBarHeight: 44,
  screenHorizontalPadding: 30,
  screenBottomPadding: 44,
  pinkHeaderTop: -40,
  pinkHeaderHeightPercent: 0.6,
  pinkHeaderTranslateLogin: -140,
  pinkHeaderTranslateSignup: -260,
  authMarginTopLogin: 344,
  authMarginTopSignup: 224,
} as const;

export const LOGIN_ANIMATION = {
  welcomeDelayMs: 500,
  welcomeDurationMs: 800,
  stateTransitionMs: 800,
  authFadeInMs: 500,
  footerFadeInMs: 600,
  collapseMs: 500,
} as const;

export const LOGIN_PASSWORD_MIN_LENGTH = 8;
export const LOGIN_DEFAULT_LOCALE = 'ko-KR';

export const LOGIN_INITIAL_FORM_VALUES: LoginFormValues = {
  email: '',
  password: '',
  confirmPassword: '',
  verificationCode: '',
  rememberMe: false,
};
