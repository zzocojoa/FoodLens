import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard } from 'react-native';
import { isAuthEmailVerificationChallenge } from '@/services/auth/authApi';
import { hasSeenOnboarding } from '@/services/storage';
import { persistSession } from '@/services/auth/sessionManager';
import {
  LOGIN_COPY,
  LOGIN_INITIAL_FORM_VALUES,
  LOGIN_PASSWORD_MIN_LENGTH,
} from '../constants/login.constants';
import { loginAuthService } from '../services/loginAuthService';
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
  const [mode, setMode] = useState<LoginAuthMode>('login');
  const [formValues, setFormValues] = useState<LoginFormValues>(LOGIN_INITIAL_FORM_VALUES);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [pendingEmailVerification, setPendingEmailVerification] = useState<LoginPendingEmailVerification | null>(null);
  const [pendingPasswordReset, setPendingPasswordReset] = useState<LoginPendingPasswordReset | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const { motion, welcomeInteractive, authInteractive, goToAuth, setAuthMode } = useLoginMotion();

  const emailVerificationStepActive = mode === 'signup' && pendingEmailVerification !== null;
  const passwordResetStepActive = mode === 'login' && pendingPasswordReset !== null;
  const verificationStepActive = emailVerificationStepActive || passwordResetStepActive;

  const authCopy = useMemo(() => {
    const baseCopy = getAuthCopy(mode);
    if (!emailVerificationStepActive && !passwordResetStepActive) {
      return baseCopy;
    }

    if (passwordResetStepActive) {
      return {
        ...baseCopy,
        title: LOGIN_COPY.resetPasswordTitle,
        primaryButtonLabel: LOGIN_COPY.resetPasswordPrimaryButton,
      };
    }

    return {
      ...baseCopy,
      primaryButtonLabel: LOGIN_COPY.verifyEmailPrimaryButton,
    };
  }, [emailVerificationStepActive, mode, passwordResetStepActive]);

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
    setMode(nextMode);
    setErrorMessage(null);
    resetAuthPendingState();
    setAuthMode(nextMode);
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = formValues.email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setErrorMessage(LOGIN_COPY.invalidEmailOrPassword);
      return;
    }

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
      setInfoMessage(reset.resetId || reset.debugCode ? LOGIN_COPY.passwordResetCodeSent : LOGIN_COPY.passwordResetRequestAccepted);
      setFormValues((prev) => ({
        ...prev,
        password: '',
        confirmPassword: '',
        verificationCode: reset.debugCode || '',
      }));
    } catch (error) {
      setErrorMessage(loginAuthService.resolveAuthErrorMessage(error));
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

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (emailVerificationStepActive && pendingEmailVerification) {
      if (!formValues.verificationCode.trim()) {
        setErrorMessage(LOGIN_COPY.invalidVerificationCode);
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
        await persistSession(session);
        await completeSignIn(session.user.id);
      } catch (error) {
        setErrorMessage(loginAuthService.resolveAuthErrorMessage(error));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (passwordResetStepActive && pendingPasswordReset) {
      if (!formValues.verificationCode.trim()) {
        setErrorMessage(LOGIN_COPY.passwordResetCodeRejected);
        return;
      }
      if (formValues.password.trim().length < LOGIN_PASSWORD_MIN_LENGTH) {
        setErrorMessage(LOGIN_COPY.passwordResetInvalidPassword);
        return;
      }
      if (formValues.password !== formValues.confirmPassword) {
        setErrorMessage(LOGIN_COPY.passwordResetPasswordMismatch);
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
        setInfoMessage(LOGIN_COPY.passwordResetSuccess);
        setFormValues((prev) => ({
          ...prev,
          password: '',
          confirmPassword: '',
          verificationCode: '',
        }));
      } catch (error) {
        setErrorMessage(loginAuthService.resolveAuthErrorMessage(error));
      } finally {
        setLoading(false);
      }
      return;
    }

    const validationError = validateLoginForm(mode, formValues);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const result = await loginAuthService.submitEmailAuth({ mode, values: formValues });
      if (isAuthEmailVerificationChallenge(result)) {
        setPendingEmailVerification({
          email: result.user.email,
          expiresInSeconds: result.verificationExpiresIn,
          debugCode: result.debugCode,
        });
        setInfoMessage(LOGIN_COPY.emailVerificationSent);
        if (result.debugCode) {
          setFormValues((prev) => ({
            ...prev,
            verificationCode: result.debugCode || prev.verificationCode,
          }));
        }
        return;
      }

      await persistSession(result);
      await completeSignIn(result.user.id);
    } catch (error) {
      setErrorMessage(loginAuthService.resolveAuthErrorMessage(error));
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
      await persistSession(session);
      await completeSignIn(session.user.id);
    } catch (error) {
      setErrorMessage(loginAuthService.resolveAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return {
    mode,
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
