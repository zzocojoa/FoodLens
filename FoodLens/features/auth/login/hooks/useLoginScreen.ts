import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard } from 'react-native';
import { isAuthEmailVerificationChallenge } from '@/services/auth/authApi';
import { hasSeenOnboarding } from '@/services/storage';
import { persistSession } from '@/services/auth/sessionManager';
import { LOGIN_COPY, LOGIN_INITIAL_FORM_VALUES } from '../constants/login.constants';
import { loginAuthService } from '../services/loginAuthService';
import {
  LoginAuthMode,
  LoginFormValues,
  LoginOAuthProvider,
  LoginPendingEmailVerification,
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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const { motion, welcomeInteractive, authInteractive, goToAuth, setAuthMode } = useLoginMotion();

  const verificationStepActive = mode === 'signup' && pendingEmailVerification !== null;

  const authCopy = useMemo(() => {
    const baseCopy = getAuthCopy(mode);
    if (!verificationStepActive) {
      return baseCopy;
    }

    return {
      ...baseCopy,
      primaryButtonLabel: LOGIN_COPY.verifyEmailPrimaryButton,
    };
  }, [mode, verificationStepActive]);

  const setFieldValue = <K extends keyof LoginFormValues>(field: K, value: LoginFormValues[K]): void => {
    setFormValues((prev) => updateField(prev, field, value));
  };

  const resetVerificationState = () => {
    setPendingEmailVerification(null);
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
    resetVerificationState();
    setAuthMode(nextMode);
  };

  const handleForgotPassword = () => {
    setErrorMessage(LOGIN_COPY.forgotPasswordUnsupported);
  };

  const completeSignIn = async (userId: string): Promise<void> => {
    const seenOnboarding = await hasSeenOnboarding(userId);
    router.replace(seenOnboarding ? '/(tabs)' : '/onboarding');
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (verificationStepActive && pendingEmailVerification) {
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
        resetVerificationState();
        await persistSession(session);
        await completeSignIn(session.user.id);
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
    handleSubmit,
    handleOAuthSignIn,
  };
};
