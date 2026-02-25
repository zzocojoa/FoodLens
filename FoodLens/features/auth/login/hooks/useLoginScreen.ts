import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard } from 'react-native';
import { AuthSessionTokens, isAuthEmailVerificationChallenge } from '@/services/auth/authApi_Logic';
import { hasSeenOnboarding } from '@/services/storage_Logic';
import { persistSession } from '@/services/auth/sessionManager_Logic';
import { useI18n } from '@/features/i18n';
import {
  createLoginCopy,
  LOGIN_ALERT_AUTO_DISMISS_MS,
  LOGIN_INITIAL_FORM_VALUES,
  LOGIN_PASSWORD_MIN_LENGTH,
} from '../constants/login.constants';
import { loginAuthService } from '../services/loginAuthService_Logic';
import {
  LoginAuthMode,
  LoginFormValues,
  LoginOAuthProvider,
  LoginPendingEmailVerification,
  LoginPendingPasswordReset,
} from '../types/login.types';
import { getAuthCopy, validateLoginForm } from '../utils/login.utils';
import { useLoginMotion } from './useLoginMotion';

const updateField = <K extends keyof LoginFormValues>(
  prev: LoginFormValues,
  field: K,
  value: LoginFormValues[K],
): LoginFormValues => ({
  ...prev,
  [field]: value,
});

export const useLoginScreen = () => {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<LoginAuthMode>('login');
  const [formValues, setFormValues] = useState<LoginFormValues>(LOGIN_INITIAL_FORM_VALUES);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [pendingEmailVerification, setPendingEmailVerification] = useState<LoginPendingEmailVerification | null>(null);
  const [pendingPasswordReset, setPendingPasswordReset] = useState<LoginPendingPasswordReset | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const transientErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { motion, welcomeInteractive, authInteractive, goToAuth, setAuthMode } = useLoginMotion();
  const loginCopy = useMemo(() => createLoginCopy(t), [t]);

  const clearTransientErrorTimeout = () => {
    if (!transientErrorTimeoutRef.current) {
      return;
    }
    clearTimeout(transientErrorTimeoutRef.current);
    transientErrorTimeoutRef.current = null;
  };

  const showTransientError = (message: string) => {
    clearTransientErrorTimeout();
    setErrorMessage(message);
    transientErrorTimeoutRef.current = setTimeout(() => {
      setErrorMessage((currentMessage) => (currentMessage === message ? null : currentMessage));
      transientErrorTimeoutRef.current = null;
    }, LOGIN_ALERT_AUTO_DISMISS_MS);
  };

  useEffect(() => {
    return () => {
      clearTransientErrorTimeout();
    };
  }, []);

  const emailVerificationStepActive = mode === 'signup' && pendingEmailVerification !== null;
  const passwordResetStepActive = mode === 'login' && pendingPasswordReset !== null;
  const verificationStepActive = emailVerificationStepActive || passwordResetStepActive;

  const authCopy = useMemo(() => {
    const baseCopy = getAuthCopy(mode, loginCopy);
    if (!emailVerificationStepActive && !passwordResetStepActive) {
      return baseCopy;
    }

    if (passwordResetStepActive) {
      return {
        ...baseCopy,
        title: loginCopy.resetPasswordTitle,
        primaryButtonLabel: loginCopy.resetPasswordPrimaryButton,
      };
    }

    return {
      ...baseCopy,
      primaryButtonLabel: loginCopy.verifyEmailPrimaryButton,
    };
  }, [emailVerificationStepActive, loginCopy, mode, passwordResetStepActive]);

  const setFieldValue = <K extends keyof LoginFormValues>(field: K, value: LoginFormValues[K]): void => {
    setFormValues((prev) => updateField(prev, field, value));
  };

  const resetAuthPendingState = () => {
    setPendingEmailVerification(null);
    setPendingPasswordReset(null);
    setInfoMessage(null);
    setFormValues((prev) => ({
      ...prev,
      verificationCode: '',
    }));
  };

  const handleContinue = () => {
    goToAuth('login');
  };

  const handleSwitchMode = (nextMode: LoginAuthMode) => {
    clearTransientErrorTimeout();
    setMode(nextMode);
    setErrorMessage(null);
    resetAuthPendingState();
    setAuthMode(nextMode);
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = formValues.email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      showTransientError(loginCopy.invalidEmailForReset);
      return;
    }

    clearTransientErrorTimeout();
    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const reset = await loginAuthService.requestPasswordReset({ email: normalizedEmail });
      setPendingPasswordReset({
        email: normalizedEmail,
        expiresInSeconds: reset.resetExpiresIn,
        debugCode: reset.debugCode,
      });
      setInfoMessage(null);
      setFormValues((prev) => ({
        ...prev,
        password: '',
        confirmPassword: '',
        verificationCode: reset.debugCode || '',
      }));
    } catch (error) {
      setErrorMessage(loginAuthService.resolveAuthErrorMessage(error, loginCopy));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPasswordReset = () => {
    setPendingPasswordReset(null);
    setErrorMessage(null);
    setInfoMessage(null);
    setFormValues((prev) => ({
      ...prev,
      password: '',
      confirmPassword: '',
      verificationCode: '',
    }));
  };

  const completeSignIn = async (userId: string): Promise<void> => {
    const seenOnboarding = await hasSeenOnboarding(userId);
    router.replace(seenOnboarding ? '/(tabs)' : '/onboarding');
  };

  const persistAuthenticatedSession = async (session: AuthSessionTokens, rememberMe: boolean): Promise<void> => {
    if (rememberMe) {
      await persistSession(session);
      return;
    }
    await persistSession(session, { rememberMe: false });
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (emailVerificationStepActive && pendingEmailVerification) {
      if (!formValues.verificationCode.trim()) {
        setErrorMessage(loginCopy.invalidVerificationCode);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const session = await loginAuthService.verifyEmailCode({
          email: pendingEmailVerification.email,
          code: formValues.verificationCode,
        });
        resetAuthPendingState();
        await persistAuthenticatedSession(session, true);
        await completeSignIn(session.user.id);
      } catch (error) {
        setErrorMessage(loginAuthService.resolveAuthErrorMessage(error, loginCopy));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (passwordResetStepActive && pendingPasswordReset) {
      if (!formValues.verificationCode.trim()) {
        setErrorMessage(loginCopy.passwordResetCodeRejected);
        return;
      }
      if (formValues.password.trim().length < LOGIN_PASSWORD_MIN_LENGTH) {
        setErrorMessage(loginCopy.passwordResetInvalidPassword);
        return;
      }
      if (formValues.password !== formValues.confirmPassword) {
        setErrorMessage(loginCopy.passwordResetPasswordMismatch);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      try {
        await loginAuthService.confirmPasswordReset({
          email: pendingPasswordReset.email,
          code: formValues.verificationCode,
          newPassword: formValues.password,
        });
        setPendingPasswordReset(null);
        setInfoMessage(loginCopy.passwordResetSuccess);
        setFormValues((prev) => ({
          ...prev,
          password: '',
          confirmPassword: '',
          verificationCode: '',
        }));
      } catch (error) {
        setErrorMessage(loginAuthService.resolveAuthErrorMessage(error, loginCopy));
      } finally {
        setLoading(false);
      }
      return;
    }

    const validationError = validateLoginForm(mode, formValues, loginCopy);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const result = await loginAuthService.submitEmailAuth({ mode, values: formValues, locale });
      if (isAuthEmailVerificationChallenge(result)) {
        setPendingEmailVerification({
          email: result.user.email,
          expiresInSeconds: result.verificationExpiresIn,
          debugCode: result.debugCode,
        });
        setInfoMessage(loginCopy.emailVerificationSent);
        if (result.debugCode) {
          setFormValues((prev) => ({
            ...prev,
            verificationCode: result.debugCode || prev.verificationCode,
          }));
        }
        return;
      }

      const shouldRememberSession = mode === 'login' ? formValues.rememberMe : true;
      await persistAuthenticatedSession(result, shouldRememberSession);
      await completeSignIn(result.user.id);
    } catch (error) {
      setErrorMessage(loginAuthService.resolveAuthErrorMessage(error, loginCopy));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: LoginOAuthProvider) => {
    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const session = await loginAuthService.submitOAuthAuth(provider);
      const shouldRememberSession = mode === 'login' ? formValues.rememberMe : true;
      await persistAuthenticatedSession(session, shouldRememberSession);
      await completeSignIn(session.user.id);
    } catch (error) {
      setErrorMessage(loginAuthService.resolveAuthErrorMessage(error, loginCopy));
    } finally {
      setLoading(false);
    }
  };

  return {
    mode,
    loginCopy,
    authCopy,
    formValues,
    loading,
    errorMessage,
    infoMessage,
    verificationStepActive,
    emailVerificationStepActive,
    passwordResetStepActive,
    passwordVisible,
    confirmPasswordVisible,
    welcomeInteractive,
    authInteractive,
    motion,
    setFieldValue,
    setPasswordVisible,
    setConfirmPasswordVisible,
    handleContinue,
    handleSwitchMode,
    handleForgotPassword,
    handleCancelPasswordReset,
    handleSubmit,
    handleOAuthSignIn,
  };
};
