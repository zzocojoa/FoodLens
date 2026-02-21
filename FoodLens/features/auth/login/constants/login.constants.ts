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
  loginPrimaryButton: 'Login',
  signupPrimaryButton: 'Create Account',
  verifyEmailPrimaryButton: 'Verify Email',
  resetPasswordPrimaryButton: 'Reset Password',
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
  genericAuthFailure: 'Authentication failed. Please try again.',
} as const;

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
