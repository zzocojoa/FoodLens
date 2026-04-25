/// <reference types="jest" />

import React from 'react';
import { render } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';
import LoginScreen from '../LoginScreen';
import { useLoginScreen } from '../../hooks/useLoginScreen';
import { LoginAuthCopy, LoginFormValues } from '../../types/login.types';
import { LOGIN_COPY } from '../../constants/login.constants';

const mockBackHandlerRemove = jest.fn();
let backPressHandler: null | (() => boolean) = null;

jest.mock('../../hooks/useLoginScreen', () => ({
  useLoginScreen: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    effect();
  },
}));

jest.mock('lucide-react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ArrowRight: () => ReactModule.createElement(Text, null, 'icon-arrow-right'),
    Eye: () => ReactModule.createElement(Text, null, 'icon-eye'),
    EyeOff: () => ReactModule.createElement(Text, null, 'icon-eye-off'),
    Lock: () => ReactModule.createElement(Text, null, 'icon-lock'),
    Mail: () => ReactModule.createElement(Text, null, 'icon-mail'),
    Shield: () => ReactModule.createElement(Text, null, 'icon-shield'),
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
    loginCopy: LOGIN_COPY,
    authCopy: AUTH_COPY_LOGIN,
    formValues: FORM_VALUES,
    loading: false,
    errorMessage: null,
    infoMessage: null,
    verificationStepActive: false,
    emailVerificationStepActive: false,
    verificationCountdownLabel: null,
    verificationExpired: false,
    passwordResetCodeSent: false,
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
    handleBackNavigation: jest.fn(() => true),
    handleSwitchMode: jest.fn(),
    handleForgotPassword: jest.fn(),
    handleCancelPasswordReset: jest.fn(),
    handleResendPasswordReset: jest.fn(),
    handleResendEmailVerification: jest.fn(),
    handleSubmit: jest.fn(),
    handleOAuthSignIn: jest.fn(),
    ...overrides,
  }) as unknown as ReturnType<typeof useLoginScreen>;

describe('LoginScreen', () => {
  beforeEach(() => {
    backPressHandler = null;
    mockBackHandlerRemove.mockClear();
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_, handler) => {
        backPressHandler = handler as () => boolean;
        return { remove: mockBackHandlerRemove } as never;
      });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
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

  it('routes Android hardware back through login back navigation handler', () => {
    const handleBackNavigation = jest.fn(() => true);
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    mockedUseLoginScreen.mockReturnValue(
      createHookValue({
        handleBackNavigation,
      }),
    );

    render(<LoginScreen />);

    expect(backPressHandler).not.toBeNull();
    const handled = backPressHandler as () => boolean;
    expect(handled()).toBe(true);
    expect(handleBackNavigation).toHaveBeenCalledTimes(1);
  });
});
