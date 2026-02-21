/// <reference types="jest" />

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LoginAuthScreen from '../LoginAuthScreen';
import { LoginAuthCopy, LoginFormValues } from '../../types/login.types';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    Feather: ({ name }: { name: string }) =>
      ReactModule.createElement(Text, null, `icon-${name}`),
  };
});

const AUTH_COPY: LoginAuthCopy = {
  title: 'Sign in',
  primaryButtonLabel: 'Login',
  switchLeadText: "Don't have an Account ?",
  switchActionText: 'Sign up',
  nextMode: 'signup',
};

const FORM_VALUES: LoginFormValues = {
  email: '',
  password: '',
  confirmPassword: '',
  verificationCode: '',
  rememberMe: false,
};

const createProps = (overrides?: Partial<React.ComponentProps<typeof LoginAuthScreen>>) => ({
  isActive: true,
  authCopy: AUTH_COPY,
  formValues: FORM_VALUES,
  loading: false,
  errorMessage: null,
  infoMessage: null,
  verificationStepActive: false,
  passwordResetStepActive: false,
  passwordVisible: false,
  confirmPasswordVisible: false,
  screenStyle: {},
  containerStyle: {},
  footerStyle: {},
  signupFieldStyle: {},
  loginActionRowStyle: {},
  onChangeEmail: jest.fn(),
  onChangePassword: jest.fn(),
  onChangeConfirmPassword: jest.fn(),
  onChangeVerificationCode: jest.fn(),
  onToggleRememberMe: jest.fn(),
  onTogglePasswordVisible: jest.fn(),
  onToggleConfirmPasswordVisible: jest.fn(),
  onForgotPassword: jest.fn(),
  onCancelPasswordReset: jest.fn(),
  onSwitchMode: jest.fn(),
  onSubmit: jest.fn(),
  onOAuthLogin: jest.fn(),
  ...overrides,
});

describe('LoginAuthScreen', () => {
  it('matches snapshot in login mode', () => {
    const { toJSON } = render(<LoginAuthScreen {...createProps()} />);

    expect(toJSON()).toMatchSnapshot();
  });

  it('matches snapshot in signup mode', () => {
    const signupCopy: LoginAuthCopy = {
      title: 'Sign up',
      primaryButtonLabel: 'Create Account',
      switchLeadText: 'Already have an Account!',
      switchActionText: 'Login',
      nextMode: 'login',
    };

    const { toJSON } = render(
      <LoginAuthScreen
        {...createProps({
          authCopy: signupCopy,
          formValues: {
            ...FORM_VALUES,
            email: 'example@foodlens.ai',
          },
        })}
      />,
    );

    expect(toJSON()).toMatchSnapshot();
  });

  it('renders OAuth icon buttons with accessibility metadata', () => {
    const { getByTestId, getByText } = render(<LoginAuthScreen {...createProps()} />);

    const googleButton = getByTestId('oauth-google-button');
    const kakaoButton = getByTestId('oauth-kakao-button');

    expect(getByText('Or continue with')).toBeTruthy();
    expect(googleButton.props.accessibilityLabel).toBe('Continue with Google');
    expect(googleButton.props.accessibilityRole).toBe('button');
    expect(googleButton.props.accessibilityHint).toBe('Sign in using your Google account.');
    expect(kakaoButton.props.accessibilityLabel).toBe('Continue with Kakao');
    expect(kakaoButton.props.accessibilityRole).toBe('button');
    expect(kakaoButton.props.accessibilityHint).toBe('Sign in using your Kakao account.');
  });

  it('calls OAuth handler with the selected provider', () => {
    const onOAuthLogin = jest.fn();
    const { getByTestId } = render(
      <LoginAuthScreen {...createProps({ onOAuthLogin })} />,
    );

    fireEvent.press(getByTestId('oauth-google-button'));
    fireEvent.press(getByTestId('oauth-kakao-button'));

    expect(onOAuthLogin).toHaveBeenNthCalledWith(1, 'google');
    expect(onOAuthLogin).toHaveBeenNthCalledWith(2, 'kakao');
    expect(onOAuthLogin).toHaveBeenCalledTimes(2);
  });

  it('renders password reset view when reset step is active', () => {
    const { queryByText, getByText } = render(
      <LoginAuthScreen
        {...createProps({
          authCopy: {
            title: 'Reset Password',
            primaryButtonLabel: 'Reset Password',
            switchLeadText: '',
            switchActionText: '',
            nextMode: 'login',
          },
          verificationStepActive: true,
          passwordResetStepActive: true,
        })}
      />,
    );

    expect(getByText('Back to Sign in')).toBeTruthy();
    expect(getByText('Confirm New Password')).toBeTruthy();
    expect(queryByText('Or continue with')).toBeNull();
    expect(queryByText("Don't have an Account ?")).toBeNull();
  });
});
