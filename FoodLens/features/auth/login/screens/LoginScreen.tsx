import React, { useEffect } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LOGIN_LAYOUT } from '../constants/login.constants';
import { useLoginScreen } from '../hooks/useLoginScreen';
import { loginStyles } from '../styles/loginStyles';
import LoginAuthScreen from '../components/LoginAuthScreen';
import LoginPinkHeader from '../components/LoginPinkHeader';
import LoginWelcomeScreen from '../components/LoginWelcomeScreen';

export default function LoginScreen() {
  const { width, height } = useWindowDimensions();
  const isFramedViewport =
    Platform.OS === 'web' &&
    width > LOGIN_LAYOUT.phoneMaxWidth + 32 &&
    height > LOGIN_LAYOUT.phoneMaxHeight + 24;

  const {
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
  } = useLoginScreen();

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const onBackPress = () => {
      BackHandler.exitApp();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={loginStyles.safeArea} edges={['top', 'bottom']}>
        <View
          style={[
            loginStyles.root,
            isFramedViewport ? loginStyles.rootFramed : loginStyles.rootFull,
          ]}
        >
          <View
            style={[
              loginStyles.phoneContainer,
              isFramedViewport
                ? loginStyles.phoneContainerFramed
                : loginStyles.phoneContainerCompact,
            ]}
          >
            <LoginPinkHeader animatedStyle={motion.pinkHeaderStyle} />

            <KeyboardAvoidingView
              behavior={Platform.OS === 'web' ? undefined : 'padding'}
              enabled={Platform.OS !== 'web'}
              style={{ flex: 1 }}
            >
              <LoginWelcomeScreen
                isActive={welcomeInteractive}
                copy={loginCopy}
                screenStyle={motion.welcomeScreenStyle}
                titleStyle={motion.welcomeTitleStyle}
                descriptionStyle={motion.welcomeDescriptionStyle}
                continueStyle={motion.welcomeContinueStyle}
                onContinue={handleContinue}
              />

              <LoginAuthScreen
                isActive={authInteractive}
                authCopy={authCopy}
                mode={mode}
                copy={loginCopy}
                formValues={formValues}
                loading={loading}
                errorMessage={errorMessage}
                infoMessage={infoMessage}
                verificationStepActive={verificationStepActive}
                emailVerificationStepActive={emailVerificationStepActive}
                verificationCountdownLabel={verificationCountdownLabel}
                verificationExpired={verificationExpired}
                passwordResetCodeSent={passwordResetCodeSent}
                passwordResetStepActive={passwordResetStepActive}
                passwordVisible={passwordVisible}
                confirmPasswordVisible={confirmPasswordVisible}
                screenStyle={motion.authScreenStyle}
                containerStyle={motion.authContainerStyle}
                footerStyle={motion.authFooterStyle}
                signupFieldStyle={motion.signupFieldStyle}
                loginActionRowStyle={motion.loginActionRowStyle}
                onChangeEmail={(value) => setFieldValue('email', value)}
                onChangePassword={(value) => setFieldValue('password', value)}
                onChangeConfirmPassword={(value) =>
                  setFieldValue('confirmPassword', value)
                }
                onChangeVerificationCode={(value) =>
                  setFieldValue('verificationCode', value)
                }
                onToggleRememberMe={() =>
                  setFieldValue('rememberMe', !formValues.rememberMe)
                }
                onTogglePasswordVisible={() => setPasswordVisible((prev) => !prev)}
                onToggleConfirmPasswordVisible={() =>
                  setConfirmPasswordVisible((prev) => !prev)
                }
                onForgotPassword={handleForgotPassword}
                onCancelPasswordReset={handleCancelPasswordReset}
                onResendPasswordReset={handleResendPasswordReset}
                onResendEmailVerification={handleResendEmailVerification}
                onSwitchMode={handleSwitchMode}
                onSubmit={handleSubmit}
                onOAuthLogin={handleOAuthSignIn}
              />
            </KeyboardAvoidingView>
          </View>
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}
