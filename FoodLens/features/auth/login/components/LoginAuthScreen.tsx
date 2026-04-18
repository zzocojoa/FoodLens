import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LOGIN_COLORS, LoginCopy } from '../constants/login.constants';
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
  rightActionLabel?: string;
  onPressRightAction?: () => void;
  rightActionDisabled?: boolean;
  rightActionTestID?: string;
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
  rightActionLabel,
  onPressRightAction,
  rightActionDisabled = false,
  rightActionTestID,
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
      {rightActionLabel && onPressRightAction ? (
        <Pressable
          testID={rightActionTestID}
          onPress={onPressRightAction}
          disabled={rightActionDisabled}
          style={loginStyles.inputActionButton}
        >
          <Text
            style={[
              loginStyles.inputActionText,
              rightActionDisabled ? loginStyles.verificationResendTextDisabled : null,
            ]}
          >
            {rightActionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  </View>
);

type LoginAuthScreenProps = {
  isActive: boolean;
  authCopy: LoginAuthCopy;
  mode: LoginAuthMode;
  copy: LoginCopy;
  formValues: LoginFormValues;
  loading: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
  verificationStepActive: boolean;
  emailVerificationStepActive: boolean;
  verificationCountdownLabel: string | null;
  verificationExpired: boolean;
  passwordResetCodeSent: boolean;
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
  onResendPasswordReset: () => void;
  onResendEmailVerification: () => void;
  onSwitchMode: (nextMode: LoginAuthMode) => void;
  onSubmit: () => void;
  onOAuthLogin: (provider: LoginOAuthProvider) => void;
};

export default function LoginAuthScreen({
  isActive,
  authCopy,
  mode,
  copy,
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
  onResendPasswordReset,
  onResendEmailVerification,
  onSwitchMode,
  onSubmit,
  onOAuthLogin,
}: LoginAuthScreenProps) {
  const router = useRouter();
  const displayedMessage = errorMessage ?? infoMessage;
  const displayedMessageType: 'error' | 'info' | null = errorMessage
    ? 'error'
    : infoMessage
    ? 'info'
    : null;
  const messageLines = displayedMessage
    ? displayedMessage
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    : [];
  const hasMessage = messageLines.length > 0;
  const showSignupVerificationField = mode === 'signup';
  const showVerificationMeta =
    showSignupVerificationField || (passwordResetStepActive && passwordResetCodeSent);
  const verificationMetaText = emailVerificationStepActive
    ? verificationExpired || !verificationCountdownLabel
      ? copy.verificationExpired
      : `${copy.verificationExpiresInPrefix} ${verificationCountdownLabel}`
    : passwordResetStepActive && passwordResetCodeSent
    ? verificationExpired || !verificationCountdownLabel
      ? copy.verificationExpired
      : `${copy.verificationExpiresInPrefix} ${verificationCountdownLabel}`
    : copy.verificationHelpText;
  const authContainerStyle = [loginStyles.authContainer, containerStyle];
  const inactiveWebScreenStyle = Platform.OS === 'web' && !isActive ? { display: 'none' as const } : null;

  const footerContent = (
    <>
      {hasMessage ? (
        <View
          style={[
            loginStyles.messageCard,
            displayedMessageType === 'error'
              ? loginStyles.errorMessageCard
              : loginStyles.infoMessageCard,
          ]}
        >
          {messageLines.map((line, index) => (
            <Text
              key={`message-line-${index}`}
              style={[
                displayedMessageType === 'error'
                  ? loginStyles.errorMessageText
                  : loginStyles.infoMessageText,
                index > 0 ? loginStyles.messageLineGap : null,
              ]}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}

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
            <Text style={loginStyles.oauthDividerText}>{copy.oauthDividerText}</Text>
            <View style={loginStyles.oauthDividerLine} />
          </View>

          <View style={loginStyles.oauthButtonGroup}>
            <Pressable
              testID="oauth-google-button"
              disabled={loading}
              onPress={() => onOAuthLogin('google')}
              accessibilityRole="button"
              accessibilityLabel={copy.oauthGoogleButton}
              accessibilityHint={copy.oauthGoogleHint}
              style={[loginStyles.oauthButton, loginStyles.oauthGoogleButton]}
            >
              <GoogleIcon size={18} />
            </Pressable>
            <Pressable
              testID="oauth-kakao-button"
              disabled={loading}
              onPress={() => onOAuthLogin('kakao')}
              accessibilityRole="button"
              accessibilityLabel={copy.oauthKakaoButton}
              accessibilityHint={copy.oauthKakaoHint}
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

          <View style={loginStyles.supportPanel}>
            <Text style={loginStyles.supportHint}>{copy.supportHint}</Text>
            <View style={loginStyles.supportLinksRow}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={copy.supportHelp}
                onPress={() => router.push('/help/faq')}
                style={loginStyles.supportLinkPressable}
              >
                <Text style={loginStyles.supportLink}>{copy.supportHelp}</Text>
              </Pressable>
              <Text style={loginStyles.supportSeparator}>•</Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={copy.supportContact}
                onPress={() => router.push('/help/contact')}
                style={loginStyles.supportLinkPressable}
              >
                <Text style={loginStyles.supportLink}>{copy.supportContact}</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : (
        <>
          <View
            style={[loginStyles.oauthDivider, loginStyles.footerGhostSpacer]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={loginStyles.oauthDividerLine} />
            <Text style={loginStyles.oauthDividerText}>{copy.oauthDividerText}</Text>
            <View style={loginStyles.oauthDividerLine} />
          </View>

          <View
            style={[loginStyles.oauthButtonGroup, loginStyles.footerGhostSpacer]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={[loginStyles.oauthButton, loginStyles.oauthGhostButton]} />
            <View style={[loginStyles.oauthButton, loginStyles.oauthGhostButton]} />
          </View>

          <View style={loginStyles.switchAuthRow}>
            <Pressable onPress={onCancelPasswordReset}>
              <Text style={loginStyles.switchAuthAction}>{copy.resetPasswordBackToSignIn}</Text>
            </Pressable>
          </View>
        </>
      )}
    </>
  );

  const formContent = (
    <>
      <Animated.View style={authContainerStyle}>
        <View style={loginStyles.authTitleWrap}>
          <Text style={loginStyles.authTitle}>{authCopy.title}</Text>
          <View style={loginStyles.authTitleUnderline} />
        </View>

        <InputGroup
          label={copy.emailLabel}
          placeholder={copy.emailPlaceholder}
          iconName="mail"
          value={formValues.email}
          onChangeText={onChangeEmail}
          keyboardType="email-address"
          onSubmitEditing={() => Keyboard.dismiss()}
          returnKeyType="done"
        />

        <InputGroup
          label={passwordResetStepActive ? copy.newPasswordLabel : copy.passwordLabel}
          placeholder={passwordResetStepActive ? copy.newPasswordPlaceholder : copy.passwordPlaceholder}
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
                <Text style={loginStyles.checkboxText}>{copy.rememberMe}</Text>
              </Pressable>
              <Pressable onPress={onForgotPassword}>
                <Text style={loginStyles.forgotText}>{copy.forgotPassword}</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {!verificationStepActive || passwordResetStepActive ? (
          <Animated.View style={[loginStyles.collapsibleField, signupFieldStyle]}>
            <InputGroup
              label={passwordResetStepActive ? copy.confirmNewPasswordLabel : copy.confirmPasswordLabel}
              placeholder={passwordResetStepActive ? copy.confirmNewPasswordPlaceholder : copy.confirmPasswordPlaceholder}
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

        {showSignupVerificationField || verificationStepActive ? (
          <>
            <View style={loginStyles.verificationFieldWrap}>
              <InputGroup
                label={copy.verificationCodeLabel}
                placeholder={copy.verificationCodePlaceholder}
                iconName="shield"
                value={formValues.verificationCode}
                onChangeText={onChangeVerificationCode}
                keyboardType="number-pad"
                style={{ marginBottom: 0, borderBottomWidth: 0, paddingBottom: 0 }}
                onSubmitEditing={() => Keyboard.dismiss()}
                returnKeyType="done"
                rightActionLabel={
                  passwordResetStepActive
                    ? passwordResetCodeSent
                      ? copy.passwordResetResendCode
                      : copy.passwordResetSendCode
                    : undefined
                }
                onPressRightAction={passwordResetStepActive ? onResendPasswordReset : undefined}
                rightActionDisabled={passwordResetStepActive ? loading : undefined}
                rightActionTestID={passwordResetStepActive ? 'password-reset-resend-button' : undefined}
              />
            </View>
            {showVerificationMeta ? (
              <View style={loginStyles.verificationMetaRow}>
                <Text style={loginStyles.verificationMetaText}>{verificationMetaText}</Text>
                {emailVerificationStepActive ? (
                  <Pressable
                    onPress={onResendEmailVerification}
                    disabled={loading}
                    style={loginStyles.verificationResendPressable}
                  >
                    <Text
                      style={[
                        loginStyles.verificationResendText,
                        loading ? loginStyles.verificationResendTextDisabled : null,
                      ]}
                    >
                      {copy.resendVerificationCode}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}
      </Animated.View>
    </>
  );

  return (
    <Animated.View
      style={[loginStyles.screen, screenStyle, inactiveWebScreenStyle]}
      pointerEvents={isActive ? 'auto' : 'none'}
    >
      <View style={loginStyles.authBody}>
        {formContent}
        <Animated.View style={[loginStyles.authFooterInline, footerStyle]}>{footerContent}</Animated.View>
      </View>
    </Animated.View>
  );
}
