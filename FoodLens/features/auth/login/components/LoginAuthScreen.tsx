import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LOGIN_COPY, LOGIN_COLORS } from '../constants/login.constants';
import { GoogleIcon, KakaoIcon } from './OAuthProviderIcons';
import {
  LoginAuthCopy,
  LoginAuthMode,
  LoginFormValues,
  LoginOAuthProvider,
} from '../types/login.types';
import { loginStyles } from '../styles/loginStyles';

type InputGroupProps = {
  label: string;
  placeholder: string;
  iconName: React.ComponentProps<typeof Feather>['name'];
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  rightIconName?: React.ComponentProps<typeof Feather>['name'];
  onPressRightIcon?: () => void;
  style?: object;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  onSubmitEditing?: React.ComponentProps<typeof TextInput>['onSubmitEditing'];
  returnKeyType?: React.ComponentProps<typeof TextInput>['returnKeyType'];
  blurOnSubmit?: React.ComponentProps<typeof TextInput>['blurOnSubmit'];
};

const InputGroup = ({
  label,
  placeholder,
  iconName,
  value,
  onChangeText,
  secureTextEntry,
  rightIconName,
  onPressRightIcon,
  style,
  keyboardType,
  onSubmitEditing,
  returnKeyType,
  blurOnSubmit = true,
}: InputGroupProps) => (
  <View style={[loginStyles.inputGroup, style]}>
    <Text style={loginStyles.inputLabel}>{label}</Text>
    <View style={loginStyles.inputRow}>
      <Feather name={iconName} size={16} color={LOGIN_COLORS.inputIcon} />
      <Text style={loginStyles.inputPipe}>|</Text>
      <TextInput
        autoCapitalize="none"
        placeholder={placeholder}
        placeholderTextColor={LOGIN_COLORS.textSecondary}
        secureTextEntry={secureTextEntry}
        value={value}
        onChangeText={onChangeText}
        style={loginStyles.inputField}
        keyboardType={keyboardType}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        blurOnSubmit={blurOnSubmit}
      />
      {rightIconName ? (
        <Pressable onPress={onPressRightIcon} style={loginStyles.eyeButton}>
          <Feather name={rightIconName} size={16} color={LOGIN_COLORS.inputIcon} />
        </Pressable>
      ) : null}
    </View>
  </View>
);

type LoginAuthScreenProps = {
  isActive: boolean;
  authCopy: LoginAuthCopy;
  formValues: LoginFormValues;
  loading: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
  verificationStepActive: boolean;
  passwordResetStepActive: boolean;
  passwordVisible: boolean;
  confirmPasswordVisible: boolean;
  screenStyle: object;
  containerStyle: object;
  footerStyle: object;
  signupFieldStyle: object;
  loginActionRowStyle: object;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeConfirmPassword: (value: string) => void;
  onChangeVerificationCode: (value: string) => void;
  onToggleRememberMe: () => void;
  onTogglePasswordVisible: () => void;
  onToggleConfirmPasswordVisible: () => void;
  onForgotPassword: () => void;
  onCancelPasswordReset: () => void;
  onSwitchMode: (nextMode: LoginAuthMode) => void;
  onSubmit: () => void;
  onOAuthLogin: (provider: LoginOAuthProvider) => void;
};

export default function LoginAuthScreen({
  isActive,
  authCopy,
  formValues,
  loading,
  errorMessage,
  infoMessage,
  verificationStepActive,
  passwordResetStepActive,
  passwordVisible,
  confirmPasswordVisible,
  screenStyle,
  containerStyle,
  footerStyle,
  signupFieldStyle,
  loginActionRowStyle,
  onChangeEmail,
  onChangePassword,
  onChangeConfirmPassword,
  onChangeVerificationCode,
  onToggleRememberMe,
  onTogglePasswordVisible,
  onToggleConfirmPasswordVisible,
  onForgotPassword,
  onCancelPasswordReset,
  onSwitchMode,
  onSubmit,
  onOAuthLogin,
}: LoginAuthScreenProps) {
  return (
    <Animated.View style={[loginStyles.screen, screenStyle]} pointerEvents={isActive ? 'auto' : 'none'}>
      <Animated.View style={[loginStyles.authContainer, containerStyle]}>
        <View style={loginStyles.authTitleWrap}>
          <Text style={loginStyles.authTitle}>{authCopy.title}</Text>
          <View style={loginStyles.authTitleUnderline} />
        </View>

        <InputGroup
          label={LOGIN_COPY.emailLabel}
          placeholder={LOGIN_COPY.emailPlaceholder}
          iconName="mail"
          value={formValues.email}
          onChangeText={onChangeEmail}
          keyboardType="email-address"
          onSubmitEditing={() => Keyboard.dismiss()}
          returnKeyType="done"
        />

        <InputGroup
          label={passwordResetStepActive ? LOGIN_COPY.newPasswordLabel : LOGIN_COPY.passwordLabel}
          placeholder={passwordResetStepActive ? LOGIN_COPY.newPasswordPlaceholder : LOGIN_COPY.passwordPlaceholder}
          iconName="lock"
          value={formValues.password}
          onChangeText={onChangePassword}
          secureTextEntry={!passwordVisible}
          rightIconName={passwordVisible ? 'eye-off' : 'eye'}
          onPressRightIcon={onTogglePasswordVisible}
          style={{ marginBottom: 0 }}
          onSubmitEditing={() => Keyboard.dismiss()}
          returnKeyType="done"
        />

        {!passwordResetStepActive ? (
          <Animated.View style={[loginStyles.loginActionRow, loginActionRowStyle]}>
            <View style={loginStyles.actionRowInner}>
              <Pressable style={loginStyles.checkboxGroup} onPress={onToggleRememberMe}>
                <View style={[loginStyles.checkboxRect, formValues.rememberMe && loginStyles.checkboxRectChecked]} />
                <Text style={loginStyles.checkboxText}>{LOGIN_COPY.rememberMe}</Text>
              </Pressable>
              <Pressable onPress={onForgotPassword}>
                <Text style={loginStyles.forgotText}>{LOGIN_COPY.forgotPassword}</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {!verificationStepActive || passwordResetStepActive ? (
          <Animated.View style={[loginStyles.collapsibleField, signupFieldStyle]}>
            <InputGroup
              label={passwordResetStepActive ? LOGIN_COPY.confirmNewPasswordLabel : LOGIN_COPY.confirmPasswordLabel}
              placeholder={passwordResetStepActive ? LOGIN_COPY.confirmNewPasswordPlaceholder : LOGIN_COPY.confirmPasswordPlaceholder}
              iconName="lock"
              value={formValues.confirmPassword}
              onChangeText={onChangeConfirmPassword}
              secureTextEntry={!confirmPasswordVisible}
              rightIconName={confirmPasswordVisible ? 'eye-off' : 'eye'}
              onPressRightIcon={onToggleConfirmPasswordVisible}
              style={{ marginTop: 10, marginBottom: 0, borderBottomWidth: 0, paddingBottom: 0 }}
              onSubmitEditing={() => Keyboard.dismiss()}
              returnKeyType="done"
            />
          </Animated.View>
        ) : null}

        {verificationStepActive ? (
          <View style={loginStyles.verificationFieldWrap}>
            <InputGroup
              label={LOGIN_COPY.verificationCodeLabel}
              placeholder={LOGIN_COPY.verificationCodePlaceholder}
              iconName="shield"
              value={formValues.verificationCode}
              onChangeText={onChangeVerificationCode}
              keyboardType="number-pad"
              style={{ marginBottom: 0, borderBottomWidth: 0, paddingBottom: 0 }}
              onSubmitEditing={() => Keyboard.dismiss()}
              returnKeyType="done"
            />
          </View>
        ) : null}
      </Animated.View>

      <Animated.View style={[loginStyles.authFooter, footerStyle]}>
        {infoMessage ? <Text style={loginStyles.infoText}>{infoMessage}</Text> : null}
        {errorMessage ? <Text style={loginStyles.errorText}>{errorMessage}</Text> : null}

        <Pressable disabled={loading} onPress={onSubmit} style={loginStyles.primaryButton}>
          {loading ? (
            <ActivityIndicator color={LOGIN_COLORS.white} />
          ) : (
            <Text style={loginStyles.primaryButtonLabel}>{authCopy.primaryButtonLabel}</Text>
          )}
        </Pressable>

        {!passwordResetStepActive ? (
          <>
            <View style={loginStyles.oauthDivider}>
              <View style={loginStyles.oauthDividerLine} />
              <Text style={loginStyles.oauthDividerText}>{LOGIN_COPY.oauthDividerText}</Text>
              <View style={loginStyles.oauthDividerLine} />
            </View>

            <View style={loginStyles.oauthButtonGroup}>
              <Pressable
                testID="oauth-google-button"
                disabled={loading}
                onPress={() => onOAuthLogin('google')}
                accessibilityRole="button"
                accessibilityLabel={LOGIN_COPY.oauthGoogleButton}
                accessibilityHint={LOGIN_COPY.oauthGoogleHint}
                style={[loginStyles.oauthButton, loginStyles.oauthGoogleButton]}
              >
                <GoogleIcon size={18} />
              </Pressable>
              <Pressable
                testID="oauth-kakao-button"
                disabled={loading}
                onPress={() => onOAuthLogin('kakao')}
                accessibilityRole="button"
                accessibilityLabel={LOGIN_COPY.oauthKakaoButton}
                accessibilityHint={LOGIN_COPY.oauthKakaoHint}
                style={[loginStyles.oauthButton, loginStyles.oauthKakaoButton]}
              >
                <KakaoIcon size={18} />
              </Pressable>
            </View>

            <View style={loginStyles.switchAuthRow}>
              <Text style={loginStyles.switchAuthLead}>{authCopy.switchLeadText}</Text>
              <Pressable onPress={() => onSwitchMode(authCopy.nextMode)}>
                <Text style={loginStyles.switchAuthAction}>{authCopy.switchActionText}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={loginStyles.switchAuthRow}>
            <Pressable onPress={onCancelPasswordReset}>
              <Text style={loginStyles.switchAuthAction}>{LOGIN_COPY.resetPasswordBackToSignIn}</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}
