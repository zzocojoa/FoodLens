/// <reference types="jest" />

import React from 'react';
import { render } from '@testing-library/react-native';
import LoginScreen from '../LoginScreen';
import { useLoginScreen } from '../../hooks/useLoginScreen';
import { LoginAuthCopy, LoginFormValues } from '../../types/login.types';

jest.mock('../../hooks/useLoginScreen', () => ({
  useLoginScreen: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    Feather: ({ name }: { name: string }) =>
      ReactModule.createElement(Text, null, `icon-${name}`),
  };
});

const mockedUseLoginScreen = useLoginScreen as jest.MockedFunction<typeof useLoginScreen>;

const AUTH_COPY_LOGIN: LoginAuthCopy = {
  title: 'Sign in',
  primaryButtonLabel: 'Login',
  switchLeadText: "Don't have an Account ?",
  switchActionText: 'Sign up',
  nextMode: 'signup',
};

const AUTH_COPY_SIGNUP: LoginAuthCopy = {
  title: 'Sign up',
  primaryButtonLabel: 'Create Account',
  switchLeadText: 'Already have an Account!',
  switchActionText: 'Login',
  nextMode: 'login',
};

const FORM_VALUES: LoginFormValues = {
  email: '',
  password: '',
  confirmPassword: '',
  verificationCode: '',
  rememberMe: false,
};

const createHookValue = (overrides: Record<string, unknown> = {}) =>
  ({
    mode: 'login',
    authCopy: AUTH_COPY_LOGIN,
    formValues: FORM_VALUES,
    loading: false,
    errorMessage: null,
    infoMessage: null,
    verificationStepActive: false,
    passwordResetStepActive: false,
    passwordVisible: false,
    confirmPasswordVisible: false,
    welcomeInteractive: false,
    authInteractive: true,
    motion: {
      pinkHeaderStyle: {},
      welcomeScreenStyle: {},
      welcomeTitleStyle: {},
      welcomeDescriptionStyle: {},
      welcomeContinueStyle: {},
      authScreenStyle: {},
      authContainerStyle: {},
      authFooterStyle: {},
      signupFieldStyle: {},
      loginActionRowStyle: {},
    },
    setFieldValue: jest.fn(),
    setPasswordVisible: jest.fn(),
    setConfirmPasswordVisible: jest.fn(),
    handleContinue: jest.fn(),
    handleSwitchMode: jest.fn(),
    handleForgotPassword: jest.fn(),
    handleCancelPasswordReset: jest.fn(),
    handleSubmit: jest.fn(),
    handleOAuthSignIn: jest.fn(),
    ...overrides,
  }) as unknown as ReturnType<typeof useLoginScreen>;

describe('LoginScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('matches snapshot in login state', () => {
    mockedUseLoginScreen.mockReturnValue(createHookValue());

    const { toJSON } = render(<LoginScreen />);

    expect(toJSON()).toMatchSnapshot();
  });

  it('matches snapshot in signup state', () => {
    mockedUseLoginScreen.mockReturnValue(
      createHookValue({
        mode: 'signup',
        authCopy: AUTH_COPY_SIGNUP,
        formValues: {
          ...FORM_VALUES,
          email: 'example@foodlens.ai',
          password: 'password123',
          confirmPassword: 'password123',
        },
      }),
    );

    const { toJSON } = render(<LoginScreen />);

    expect(toJSON()).toMatchSnapshot();
  });
});
