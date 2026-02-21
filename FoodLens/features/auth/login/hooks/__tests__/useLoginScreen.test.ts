/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';
import { useLoginScreen } from '../useLoginScreen';
import { AuthSessionTokens } from '@/services/auth/authApi';

const mockRouterReplace = jest.fn();
const mockHasSeenOnboarding = jest.fn();
const mockPersistSession = jest.fn();
const mockSubmitEmailAuth = jest.fn();
const mockVerifyEmailCode = jest.fn();
const mockRequestPasswordReset = jest.fn();
const mockConfirmPasswordReset = jest.fn();
const mockSubmitOAuthAuth = jest.fn();
const mockResolveAuthErrorMessage = jest.fn();
const mockGoToAuth = jest.fn();
const mockSetAuthMode = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
  }),
}));

jest.mock('@/services/storage', () => ({
  hasSeenOnboarding: (...args: unknown[]) => mockHasSeenOnboarding(...args),
}));

jest.mock('@/services/auth/sessionManager', () => ({
  persistSession: (...args: unknown[]) => mockPersistSession(...args),
}));

jest.mock('../useLoginMotion', () => ({
  useLoginMotion: () => ({
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
    welcomeInteractive: true,
    authInteractive: true,
    goToAuth: mockGoToAuth,
    setAuthMode: mockSetAuthMode,
  }),
}));

jest.mock('../../services/loginAuthService', () => ({
  loginAuthService: {
    submitEmailAuth: (...args: unknown[]) => mockSubmitEmailAuth(...args),
    verifyEmailCode: (...args: unknown[]) => mockVerifyEmailCode(...args),
    requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
    confirmPasswordReset: (...args: unknown[]) => mockConfirmPasswordReset(...args),
    submitOAuthAuth: (...args: unknown[]) => mockSubmitOAuthAuth(...args),
    resolveAuthErrorMessage: (...args: unknown[]) => mockResolveAuthErrorMessage(...args),
  },
}));

const createSession = (overrides: Partial<AuthSessionTokens> = {}): AuthSessionTokens => ({
  accessToken: 'atk_test',
  refreshToken: 'rtk_test',
  expiresIn: 900,
  issuedAt: Date.now(),
  user: {
    id: 'usr_test',
    email: 'alpha@example.com',
    name: 'Alpha',
    locale: 'ko-KR',
    provider: 'email',
  },
  ...overrides,
});

describe('useLoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveAuthErrorMessage.mockReturnValue('auth failed');
    mockHasSeenOnboarding.mockResolvedValue(true);
  });

  it('completes signup with email verification and routes to tabs', async () => {
    const verificationChallenge = {
      verificationRequired: true as const,
      verificationMethod: 'email_code' as const,
      verificationChannel: 'email' as const,
      verificationExpiresIn: 600,
      verificationId: 'evr_test',
      debugCode: '123456',
      user: {
        id: 'usr_test',
        email: 'alpha@example.com',
        name: 'Alpha',
        locale: 'ko-KR',
        provider: 'email',
      },
    };
    const verifiedSession = createSession();

    mockSubmitEmailAuth.mockResolvedValue(verificationChallenge);
    mockVerifyEmailCode.mockResolvedValue(verifiedSession);

    const { result } = renderHook(() => useLoginScreen());

    act(() => {
      result.current.handleSwitchMode('signup');
      result.current.setFieldValue('email', 'alpha@example.com');
      result.current.setFieldValue('password', 'Passw0rd!');
      result.current.setFieldValue('confirmPassword', 'Passw0rd!');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockSubmitEmailAuth).toHaveBeenCalledTimes(1);
    expect(result.current.verificationStepActive).toBe(true);
    expect(result.current.infoMessage).toContain('Verification code sent');
    expect(result.current.formValues.verificationCode).toBe('123456');

    act(() => {
      result.current.setFieldValue('verificationCode', '123456');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockVerifyEmailCode).toHaveBeenCalledWith({
      email: 'alpha@example.com',
      code: '123456',
    });
    expect(mockPersistSession).toHaveBeenCalledWith(verifiedSession);
    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
    expect(result.current.verificationStepActive).toBe(false);
  });

  it('routes new user to onboarding after email verification', async () => {
    mockSubmitEmailAuth.mockResolvedValue({
      verificationRequired: true as const,
      verificationMethod: 'email_code' as const,
      verificationChannel: 'email' as const,
      verificationExpiresIn: 600,
      verificationId: 'evr_onboarding',
      user: {
        id: 'usr_new',
        email: 'new@example.com',
      },
    });
    mockVerifyEmailCode.mockResolvedValue(
      createSession({
        user: {
          id: 'usr_new',
          email: 'new@example.com',
        },
      }),
    );
    mockHasSeenOnboarding.mockResolvedValue(false);

    const { result } = renderHook(() => useLoginScreen());

    act(() => {
      result.current.handleSwitchMode('signup');
      result.current.setFieldValue('email', 'new@example.com');
      result.current.setFieldValue('password', 'Passw0rd!');
      result.current.setFieldValue('confirmPassword', 'Passw0rd!');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    act(() => {
      result.current.setFieldValue('verificationCode', '654321');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('handles forgot password request and confirmation in login mode', async () => {
    mockRequestPasswordReset.mockResolvedValue({
      resetRequested: true,
      resetMethod: 'email_code',
      resetChannel: 'email',
      resetExpiresIn: 600,
      resetId: 'prs_1',
      debugCode: '654321',
    });
    mockConfirmPasswordReset.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLoginScreen());

    act(() => {
      result.current.setFieldValue('email', 'reset@example.com');
      result.current.setFieldValue('password', 'N3wPassw0rd!');
    });

    await act(async () => {
      await result.current.handleForgotPassword();
    });

    expect(mockRequestPasswordReset).toHaveBeenCalledWith({
      email: 'reset@example.com',
    });
    expect(result.current.passwordResetStepActive).toBe(true);
    expect(result.current.formValues.verificationCode).toBe('654321');

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockConfirmPasswordReset).toHaveBeenCalledWith({
      email: 'reset@example.com',
      code: '654321',
      newPassword: 'N3wPassw0rd!',
    });
    expect(result.current.passwordResetStepActive).toBe(false);
    expect(result.current.infoMessage).toContain('Password reset complete');
  });

  it('does not enter reset step when account is not found', async () => {
    mockRequestPasswordReset.mockResolvedValue({
      resetRequested: true,
      resetMethod: 'email_code',
      resetChannel: 'email',
      resetExpiresIn: 600,
      resetId: null,
    });

    const { result } = renderHook(() => useLoginScreen());

    act(() => {
      result.current.setFieldValue('email', 'missing@example.com');
    });

    await act(async () => {
      await result.current.handleForgotPassword();
    });

    expect(result.current.passwordResetStepActive).toBe(false);
    expect(result.current.infoMessage).toContain('If an account exists');
  });
});
