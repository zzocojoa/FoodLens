import {
  AuthApi,
  AuthApiError,
  AuthEmailSignupResult,
  AuthPasswordResetChallenge,
  AuthSessionTokens,
} from '@/services/auth/authApi_Logic';
import { AuthOAuthProvider } from '@/services/auth/oauthProvider_Logic';
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
    if (error.code === 'AUTH_INVALID_CREDENTIALS') {
      return copy.invalidEmailOrPassword;
    }
    if (error.code === 'AUTH_INVALID_EMAIL') {
      return copy.invalidEmailOrPassword;
    }
    if (error.code === 'AUTH_WEAK_PASSWORD') {
      return copy.passwordResetInvalidPassword;
    }
    if (error.code === 'AUTH_EMAIL_ALREADY_EXISTS') {
      return copy.emailAlreadyExists;
    }
    if (error.code === 'AUTH_EMAIL_ALREADY_VERIFIED') {
      return copy.emailAlreadyVerified;
    }
    if (error.code === 'AUTH_PROVIDER_MISCONFIGURED') {
      return copy.providerMisconfigured;
    }
    if (error.code === 'AUTH_PROVIDER_INVALID_CODE') {
      return copy.providerInvalidCode;
    }
    if (error.code === 'AUTH_PROVIDER_INVALID_STATE') {
      return copy.providerInvalidState;
    }
    if (error.code === 'AUTH_PROVIDER_REJECTED') {
      return copy.providerRejected;
    }
    if (error.code === 'AUTH_PROVIDER_CANCELLED') {
      return copy.providerCancelled;
    }
    if (error.code === 'AUTH_PROVIDER_UNSUPPORTED') {
      return copy.providerUnsupportedForEmail;
    }
    if (error.code === 'AUTH_PROVIDER_TIMEOUT' || error.code === 'AUTH_TIMEOUT') {
      return copy.providerTimeout;
    }
    if (error.code === 'AUTH_PROVIDER_UNAVAILABLE') {
      return copy.providerUnavailable;
    }
    if (error.code === 'AUTH_REDIRECT_URI_MISMATCH') {
      return copy.providerRedirectMismatch;
    }
    if (error.code === 'AUTH_NETWORK_ERROR') {
      return copy.networkError;
    }
    if (error.code === 'AUTH_REQUEST_FAILED') {
      return copy.genericAuthFailure;
    }
    if (error.code === 'AUTH_INVALID_RESPONSE') {
      return copy.genericAuthFailure;
    }
    if (error.code === 'AUTH_EMAIL_NOT_VERIFIED') {
      return copy.emailNotVerified;
    }
    if (error.code === 'AUTH_EMAIL_VERIFICATION_INVALID') {
      return copy.invalidVerificationCode;
    }
    if (error.code === 'AUTH_EMAIL_VERIFICATION_EXPIRED') {
      return copy.verificationCodeRejected;
    }
    if (error.code === 'AUTH_EMAIL_VERIFICATION_LOCKED') {
      return copy.verificationCodeRejected;
    }
    if (error.code === 'AUTH_EMAIL_VERIFICATION_NOT_FOUND') {
      return copy.invalidVerificationCode;
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
