import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard } from 'react-native';
import {
  AuthApiError,
  AuthSessionTokens,
  isAuthEmailVerificationChallenge,
} from '@/services/auth/authApi_Logic';
import { hasSeenOnboarding } from '@/services/storage_Logic';
import { persistSession } from '@/services/auth/sessionManager_Logic';
import { useI18n } from '@/features/i18n';
import {
  LOGIN_ANIMATION,
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
import { formatCountdown, getAuthCopy, validateLoginForm } from '../utils/login.utils';
import { useLoginMotion } from './useLoginMotion';

const updateField = <K extends keyof LoginFormValues>(
  prev: LoginFormValues,
  field: K,
  value: LoginFormValues[K],
): LoginFormValues => ({
  ...prev,
  [field]: value,
});

const toEmailVerificationPendingState = (input: {
  email: string;
  expiresInSeconds: number;
  debugCode?: string;
}): LoginPendingEmailVerification => ({
  email: input.email,
  expiresInSeconds: input.expiresInSeconds,
  expiresAtMillis: Date.now() + Math.max(1, input.expiresInSeconds) * 1_000,
  debugCode: input.debugCode,
});

const toPasswordResetPendingState = (input: {
  email: string;
  expiresInSeconds: number;
  codeSent: boolean;
  debugCode?: string;
}): LoginPendingPasswordReset => ({
  email: input.email,
  expiresInSeconds: input.expiresInSeconds,
  expiresAtMillis: Date.now() + Math.max(1, input.expiresInSeconds) * 1_000,
  codeSent: input.codeSent,
  debugCode: input.debugCode,
});

const isVerificationResendEndpointMissing = (error: unknown): boolean =>
  error instanceof AuthApiError &&
  error.code === 'AUTH_REQUEST_FAILED' &&
  error.status === 404;

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
  const [verificationNowMillis, setVerificationNowMillis] = useState(() => Date.now());
  const transientErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetExitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    motion,
    welcomeInteractive,
    authInteractive,
    goToAuth,
    setAuthMode,
  } = useLoginMotion();
  const loginCopy = useMemo(() => createLoginCopy(t), [t]);

  const clearTransientErrorTimeout = () => {
    if (!transientErrorTimeoutRef.current) {
      return;
    }
    clearTimeout(transientErrorTimeoutRef.current);
    transientErrorTimeoutRef.current = null;
  };

  const clearResetExitTimeout = () => {
    if (!resetExitTimeoutRef.current) {
      return;
    }
    clearTimeout(resetExitTimeoutRef.current);
    resetExitTimeoutRef.current = null;
  };

  const showTransientError = (message: string) => {
    clearTransientErrorTimeout();
    setInfoMessage(null);
    setErrorMessage(message);
  };

  useEffect(() => {
    return () => {
      clearTransientErrorTimeout();
      clearResetExitTimeout();
    };
  }, []);

  useEffect(() => {
    clearTransientErrorTimeout();
    const activeMessage = errorMessage ?? infoMessage;
    if (!activeMessage) {
      return;
    }

    transientErrorTimeoutRef.current = setTimeout(() => {
      setErrorMessage((currentMessage) => (currentMessage === activeMessage ? null : currentMessage));
      setInfoMessage((currentMessage) => (currentMessage === activeMessage ? null : currentMessage));
      transientErrorTimeoutRef.current = null;
    }, LOGIN_ALERT_AUTO_DISMISS_MS);

    return () => {
      clearTransientErrorTimeout();
    };
  }, [errorMessage, infoMessage]);

  const emailVerificationStepActive = mode === 'signup' && pendingEmailVerification !== null;
  const passwordResetStepActive = pendingPasswordReset !== null;
  const passwordResetCodeSent = passwordResetStepActive && pendingPasswordReset?.codeSent === true;
  const verificationStepActive = emailVerificationStepActive || passwordResetStepActive;
  const activeVerificationExpiresAtMillis = emailVerificationStepActive
    ? pendingEmailVerification?.expiresAtMillis ?? null
    : passwordResetCodeSent
    ? pendingPasswordReset?.expiresAtMillis ?? null
    : null;
  const verificationSecondsRemaining = useMemo(() => {
    if (activeVerificationExpiresAtMillis === null) {
      return null;
    }
    return Math.max(0, Math.ceil((activeVerificationExpiresAtMillis - verificationNowMillis) / 1000));
  }, [activeVerificationExpiresAtMillis, verificationNowMillis]);
  const verificationExpired =
    verificationStepActive &&
    verificationSecondsRemaining !== null &&
    verificationSecondsRemaining <= 0;
  const verificationCountdownLabel = useMemo(() => {
    if (!verificationStepActive || verificationSecondsRemaining === null) {
      return null;
    }
    return formatCountdown(verificationSecondsRemaining);
  }, [verificationStepActive, verificationSecondsRemaining]);

  useEffect(() => {
    if (!verificationStepActive || activeVerificationExpiresAtMillis === null) {
      return;
    }

    setVerificationNowMillis(Date.now());
    const intervalId = setInterval(() => {
      setVerificationNowMillis(Date.now());
    }, 1_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [verificationStepActive, activeVerificationExpiresAtMillis]);

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

  const switchToMode = (nextMode: LoginAuthMode) => {
    clearResetExitTimeout();
    clearTransientErrorTimeout();
    setMode(nextMode);
    setErrorMessage(null);
    resetAuthPendingState();
    setAuthMode(nextMode);
  };

  const handleContinue = () => {
    goToAuth('login');
  };

  const handleSwitchMode = (nextMode: LoginAuthMode) => {
    switchToMode(nextMode);
  };

  const handleForgotPassword = () => {
    clearResetExitTimeout();
    const normalizedEmail = formValues.email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      showTransientError(loginCopy.invalidEmailForReset);
      return;
    }

    setMode('signup');
    setAuthMode('signup');
    clearTransientErrorTimeout();
    setErrorMessage(null);
    setInfoMessage(null);
    setPendingEmailVerification(null);
    setPendingPasswordReset(
      toPasswordResetPendingState({
        email: normalizedEmail,
        expiresInSeconds: 0,
        codeSent: false,
      }),
    );
    setVerificationNowMillis(Date.now());
    setFormValues((prev) => ({
      ...prev,
      password: '',
      confirmPassword: '',
      verificationCode: '',
    }));
  };

  const handleCancelPasswordReset = () => {
    clearResetExitTimeout();
    clearTransientErrorTimeout();
    setMode('login');
    setErrorMessage(null);
    setInfoMessage(null);
    setAuthMode('login');
    resetExitTimeoutRef.current = setTimeout(() => {
      setPendingPasswordReset(null);
      setFormValues((prev) => ({
        ...prev,
        password: '',
        confirmPassword: '',
        verificationCode: '',
      }));
      resetExitTimeoutRef.current = null;
    }, LOGIN_ANIMATION.collapseMs);
  };

  const handleResendPasswordReset = async () => {
    if (!passwordResetStepActive || !pendingPasswordReset) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const reset = await loginAuthService.requestPasswordReset({
        email: pendingPasswordReset.email,
      });
      setPendingPasswordReset(
        toPasswordResetPendingState({
          email: pendingPasswordReset.email,
          expiresInSeconds: reset.resetExpiresIn,
          codeSent: true,
          debugCode: reset.debugCode,
        }),
      );
      setVerificationNowMillis(Date.now());
      setFormValues((prev) => ({
        ...prev,
        verificationCode: reset.debugCode || '',
      }));
      setInfoMessage(loginCopy.passwordResetCodeSent);
    } catch (error) {
      setErrorMessage(loginAuthService.resolveAuthErrorMessage(error, loginCopy));
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmailVerification = async () => {
    if (!emailVerificationStepActive || !pendingEmailVerification) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const challenge = await loginAuthService.requestEmailVerification({
        email: pendingEmailVerification.email,
      });
      if (isAuthEmailVerificationChallenge(challenge)) {
        setPendingEmailVerification(
          toEmailVerificationPendingState({
            email: challenge.user.email,
            expiresInSeconds: challenge.verificationExpiresIn,
            debugCode: challenge.debugCode,
          }),
        );
        setVerificationNowMillis(Date.now());
        setInfoMessage(loginCopy.emailVerificationSent);
        setFormValues((prev) => ({
          ...prev,
          verificationCode: challenge.debugCode || '',
        }));
      }
    } catch (error) {
      if (isVerificationResendEndpointMissing(error) && mode === 'signup') {
        try {
          const fallbackResult = await loginAuthService.submitEmailAuth({
            mode: 'signup',
            values: {
              ...formValues,
              confirmPassword: formValues.confirmPassword || formValues.password,
            },
            locale,
          });
          if (isAuthEmailVerificationChallenge(fallbackResult)) {
            setPendingEmailVerification(
              toEmailVerificationPendingState({
                email: fallbackResult.user.email,
                expiresInSeconds: fallbackResult.verificationExpiresIn,
                debugCode: fallbackResult.debugCode,
              }),
            );
            setVerificationNowMillis(Date.now());
            setErrorMessage(null);
            setInfoMessage(loginCopy.emailVerificationSent);
            setFormValues((prev) => ({
              ...prev,
              verificationCode: fallbackResult.debugCode || '',
            }));
            return;
          }
        } catch (fallbackError) {
          if (
            fallbackError instanceof AuthApiError &&
            fallbackError.code === 'AUTH_EMAIL_ALREADY_EXISTS'
          ) {
            setErrorMessage(loginCopy.verificationResendUnavailable);
            setInfoMessage(null);
            return;
          }
          setErrorMessage(loginAuthService.resolveAuthErrorMessage(fallbackError, loginCopy));
          setInfoMessage(null);
          return;
        }
        setErrorMessage(loginCopy.verificationResendUnavailable);
        setInfoMessage(null);
        return;
      }
      setErrorMessage(loginAuthService.resolveAuthErrorMessage(error, loginCopy));
    } finally {
      setLoading(false);
    }
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
      if (!pendingPasswordReset.codeSent) {
        setErrorMessage(loginCopy.passwordResetCodeNotRequested);
        return;
      }
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
        setMode('login');
        setAuthMode('login');
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
        setPendingEmailVerification(
          toEmailVerificationPendingState({
            email: result.user.email,
            expiresInSeconds: result.verificationExpiresIn,
            debugCode: result.debugCode,
          }),
        );
        setVerificationNowMillis(Date.now());
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
      if (
        mode === 'login' &&
        error instanceof AuthApiError &&
        error.code === 'AUTH_EMAIL_NOT_VERIFIED'
      ) {
        switchToMode('signup');
        setFormValues((prev) => ({
          ...prev,
          confirmPassword: prev.password,
          verificationCode: '',
        }));
        try {
          const resendChallenge = await loginAuthService.requestEmailVerification({
            email: formValues.email,
          });

          if (isAuthEmailVerificationChallenge(resendChallenge)) {
            setPendingEmailVerification(
              toEmailVerificationPendingState({
                email: resendChallenge.user.email,
                expiresInSeconds: resendChallenge.verificationExpiresIn,
                debugCode: resendChallenge.debugCode,
              }),
            );
            setVerificationNowMillis(Date.now());
            setErrorMessage(null);
            setInfoMessage(loginCopy.emailVerificationSent);
            setFormValues((prev) => ({
              ...prev,
              verificationCode: resendChallenge.debugCode || '',
            }));
            return;
          }
        } catch (resendError) {
          if (isVerificationResendEndpointMissing(resendError)) {
            try {
              const fallbackResult = await loginAuthService.submitEmailAuth({
                mode: 'signup',
                values: {
                  ...formValues,
                  confirmPassword: formValues.confirmPassword || formValues.password,
                },
                locale,
              });
              if (isAuthEmailVerificationChallenge(fallbackResult)) {
                setPendingEmailVerification(
                  toEmailVerificationPendingState({
                    email: fallbackResult.user.email,
                    expiresInSeconds: fallbackResult.verificationExpiresIn,
                    debugCode: fallbackResult.debugCode,
                  }),
                );
                setVerificationNowMillis(Date.now());
                setErrorMessage(null);
                setInfoMessage(loginCopy.emailVerificationSent);
                setFormValues((prev) => ({
                  ...prev,
                  verificationCode: fallbackResult.debugCode || '',
                }));
                return;
              }
            } catch (fallbackError) {
              if (
                fallbackError instanceof AuthApiError &&
                fallbackError.code === 'AUTH_EMAIL_ALREADY_EXISTS'
              ) {
                setErrorMessage(loginCopy.verificationResendUnavailable);
                setInfoMessage(null);
                return;
              }
              setErrorMessage(loginAuthService.resolveAuthErrorMessage(fallbackError, loginCopy));
              setInfoMessage(null);
              return;
            }
            setErrorMessage(loginCopy.verificationResendUnavailable);
            setInfoMessage(null);
            return;
          }
          setErrorMessage(loginAuthService.resolveAuthErrorMessage(resendError, loginCopy));
          setInfoMessage(null);
          return;
        }

        setErrorMessage(loginCopy.emailNotVerifiedSwitchToSignup);
        setInfoMessage(null);
        return;
      }

      if (
        mode === 'signup' &&
        error instanceof AuthApiError &&
        error.code === 'AUTH_EMAIL_ALREADY_EXISTS'
      ) {
        try {
          const resendChallenge = await loginAuthService.requestEmailVerification({
            email: formValues.email,
          });

          if (isAuthEmailVerificationChallenge(resendChallenge)) {
            setPendingEmailVerification(
              toEmailVerificationPendingState({
                email: resendChallenge.user.email,
                expiresInSeconds: resendChallenge.verificationExpiresIn,
                debugCode: resendChallenge.debugCode,
              }),
            );
            setVerificationNowMillis(Date.now());
            setErrorMessage(null);
            setInfoMessage(loginCopy.emailVerificationSent);
            setFormValues((prev) => ({
              ...prev,
              verificationCode: resendChallenge.debugCode || prev.verificationCode,
            }));
            return;
          }
        } catch (resendError) {
          if (isVerificationResendEndpointMissing(resendError)) {
            setErrorMessage(loginCopy.verificationResendUnavailable);
            setInfoMessage(null);
            return;
          }
          setErrorMessage(loginAuthService.resolveAuthErrorMessage(resendError, loginCopy));
          setInfoMessage(null);
          return;
        }
      }

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
    verificationCountdownLabel,
    verificationExpired,
    passwordResetCodeSent,
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
    handleResendPasswordReset,
    handleResendEmailVerification,
    handleSubmit,
    handleOAuthSignIn,
  };
};
