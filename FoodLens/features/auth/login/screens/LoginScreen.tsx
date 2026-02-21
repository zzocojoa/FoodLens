import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
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
    loginCopy,
    authCopy,
    formValues,
    loading,
    errorMessage,
    infoMessage,
    verificationStepActive,
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
  } = useLoginScreen();

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={loginStyles.safeArea}>
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
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                copy={loginCopy}
                formValues={formValues}
                loading={loading}
                errorMessage={errorMessage}
                infoMessage={infoMessage}
                verificationStepActive={verificationStepActive}
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
                onSwitchMode={handleSwitchMode}
                onSubmit={handleSubmit}
                onOAuthLogin={handleOAuthSignIn}
              />
            </KeyboardAvoidingView>
          </View>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}
