import {
  AuthApi,
  AuthApiError,
  AuthEmailSignupResult,
  AuthPasswordResetChallenge,
  AuthSessionTokens,
} from '@/services/auth/authApi';
import { AuthOAuthProvider } from '@/services/auth/oauthProvider';
import { LOGIN_COPY, LOGIN_DEFAULT_LOCALE } from '../constants/login.constants';
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
      locale: LOGIN_DEFAULT_LOCALE,
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

const resolveAuthErrorMessage = (error: unknown): string => {
  if (error instanceof AuthApiError) {
    if (error.code === 'AUTH_EMAIL_NOT_VERIFIED') {
      return LOGIN_COPY.emailNotVerified;
    }
    if (error.code === 'AUTH_EMAIL_VERIFICATION_INVALID') {
      return LOGIN_COPY.invalidVerificationCode;
    }
    if (error.code === 'AUTH_EMAIL_VERIFICATION_EXPIRED') {
      return LOGIN_COPY.verificationCodeRejected;
    }
    if (error.code === 'AUTH_EMAIL_VERIFICATION_DELIVERY_FAILED') {
      return LOGIN_COPY.verificationDeliveryFailed;
    }
    if (error.code === 'AUTH_PASSWORD_RESET_INVALID') {
      return LOGIN_COPY.passwordResetCodeRejected;
    }
    if (error.code === 'AUTH_PASSWORD_RESET_EXPIRED') {
      return LOGIN_COPY.passwordResetCodeRejected;
    }
    if (error.code === 'AUTH_PASSWORD_RESET_LOCKED') {
      return LOGIN_COPY.passwordResetCodeRejected;
    }
    if (error.code === 'AUTH_PASSWORD_RESET_DELIVERY_FAILED') {
      return LOGIN_COPY.passwordResetDeliveryFailed;
    }
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return LOGIN_COPY.genericAuthFailure;
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
