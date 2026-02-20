import {
  LOGIN_COPY,
  LOGIN_PASSWORD_MIN_LENGTH,
} from '../constants/login.constants';
import { LoginAuthCopy, LoginAuthMode, LoginFormValues } from '../types/login.types';

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const isSignupMode = (mode: LoginAuthMode): boolean => mode === 'signup';

export const getAuthCopy = (mode: LoginAuthMode): LoginAuthCopy => {
  if (mode === 'signup') {
    return {
      title: LOGIN_COPY.signupTitle,
      primaryButtonLabel: LOGIN_COPY.signupPrimaryButton,
      switchLeadText: LOGIN_COPY.signupSwitchLead,
      switchActionText: LOGIN_COPY.signupSwitchAction,
      nextMode: 'login',
    };
  }

  return {
    title: LOGIN_COPY.loginTitle,
    primaryButtonLabel: LOGIN_COPY.loginPrimaryButton,
    switchLeadText: LOGIN_COPY.loginSwitchLead,
    switchActionText: LOGIN_COPY.loginSwitchAction,
    nextMode: 'signup',
  };
};

export const validateLoginForm = (
  mode: LoginAuthMode,
  values: LoginFormValues,
): string | null => {
  const normalizedEmail = normalizeEmail(values.email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return LOGIN_COPY.invalidEmailOrPassword;
  }

  if (values.password.trim().length < LOGIN_PASSWORD_MIN_LENGTH) {
    return LOGIN_COPY.invalidEmailOrPassword;
  }

  if (mode === 'signup' && values.password !== values.confirmPassword) {
    return LOGIN_COPY.passwordMismatch;
  }

  return null;
};
