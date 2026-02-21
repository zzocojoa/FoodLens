import {
  LOGIN_COPY,
  LOGIN_PASSWORD_MIN_LENGTH,
  LoginCopy,
} from '../constants/login.constants';
import { LoginAuthCopy, LoginAuthMode, LoginFormValues } from '../types/login.types';

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const isSignupMode = (mode: LoginAuthMode): boolean => mode === 'signup';

export const getAuthCopy = (mode: LoginAuthMode, copy: LoginCopy = LOGIN_COPY): LoginAuthCopy => {
  if (mode === 'signup') {
    return {
      title: copy.signupTitle,
      primaryButtonLabel: copy.signupPrimaryButton,
      switchLeadText: copy.signupSwitchLead,
      switchActionText: copy.signupSwitchAction,
      nextMode: 'login',
    };
  }

  return {
    title: copy.loginTitle,
    primaryButtonLabel: copy.loginPrimaryButton,
    switchLeadText: copy.loginSwitchLead,
    switchActionText: copy.loginSwitchAction,
    nextMode: 'signup',
  };
};

export const validateLoginForm = (
  mode: LoginAuthMode,
  values: LoginFormValues,
  copy: LoginCopy = LOGIN_COPY,
): string | null => {
  const normalizedEmail = normalizeEmail(values.email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return copy.invalidEmailOrPassword;
  }

  if (values.password.trim().length < LOGIN_PASSWORD_MIN_LENGTH) {
    return copy.invalidEmailOrPassword;
  }

  if (mode === 'signup' && values.password !== values.confirmPassword) {
    return copy.passwordMismatch;
  }

  return null;
};
