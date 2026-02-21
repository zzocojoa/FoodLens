import {
  AuthApi,
  AuthApiError,
  AuthEmailSignupResult,
  AuthPasswordResetChallenge,
  AuthSessionTokens,
} from '@/services/auth/authApi';
import { AuthOAuthProvider } from '@/services/auth/oauthProvider';
import { LOGIN_COPY, LOGIN_DEFAULT_LOCALE, LoginCopy } from '../constants/login.constants';
import { LoginOAuthProvider, LoginSubmitPayload } from '../types/login.types';
import { normalizeEmail } from '../utils/login.utils';

const submitEmailAuth = async (
  payload: LoginSubmitPayload,
): Promise<AuthEmailSignupResult> => {
  const email = normalizeEmail(payload.values.email);

  if (payload.mode === 'signup') {
    return AuthApi.signupWithEmail({
      email,
      password: payload.values.password,
      locale: payload.locale ?? LOGIN_DEFAULT_LOCALE,
    });
  }

  return AuthApi.loginWithEmail({
    email,
    password: payload.values.password,
  });
};

const verifyEmailCode = async (input: {
  email: string;
  code: string;
}): Promise<AuthSessionTokens> =>
  AuthApi.verifyEmail({
    email: normalizeEmail(input.email),
    code: input.code.trim(),
  });

const requestPasswordReset = async (input: { email: string }): Promise<AuthPasswordResetChallenge> =>
  AuthApi.requestPasswordReset({
    email: normalizeEmail(input.email),
  });

const confirmPasswordReset = async (input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<void> =>
  AuthApi.confirmPasswordReset({
    email: normalizeEmail(input.email),
    code: input.code.trim(),
    newPassword: input.newPassword,
  });

const resolveAuthErrorMessage = (error: unknown, copy: LoginCopy = LOGIN_COPY): string => {
  if (error instanceof AuthApiError) {
    if (error.code === 'AUTH_EMAIL_NOT_VERIFIED') {
      return copy.emailNotVerified;
    }
    if (error.code === 'AUTH_EMAIL_VERIFICATION_INVALID') {
      return copy.invalidVerificationCode;
    }
    if (error.code === 'AUTH_EMAIL_VERIFICATION_EXPIRED') {
      return copy.verificationCodeRejected;
    }
    if (error.code === 'AUTH_EMAIL_VERIFICATION_DELIVERY_FAILED') {
      return copy.verificationDeliveryFailed;
    }
    if (error.code === 'AUTH_PASSWORD_RESET_INVALID') {
      return copy.passwordResetCodeRejected;
    }
    if (error.code === 'AUTH_PASSWORD_RESET_EXPIRED') {
      return copy.passwordResetCodeRejected;
    }
    if (error.code === 'AUTH_PASSWORD_RESET_LOCKED') {
      return copy.passwordResetCodeRejected;
    }
    if (error.code === 'AUTH_PASSWORD_RESET_DELIVERY_FAILED') {
      return copy.passwordResetDeliveryFailed;
    }
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return copy.genericAuthFailure;
};

const submitOAuthAuth = async (
  provider: LoginOAuthProvider,
): Promise<AuthSessionTokens> => AuthOAuthProvider.loginWithOAuthProvider(provider);

export const loginAuthService = {
  submitEmailAuth,
  verifyEmailCode,
  requestPasswordReset,
  confirmPasswordReset,
  submitOAuthAuth,
  resolveAuthErrorMessage,
};
