/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';
import { useLoginScreen } from '../useLoginScreen';
import { AuthApiError, AuthSessionTokens } from '@/services/auth/authApi';
import { LOGIN_ALERT_AUTO_DISMISS_MS, LOGIN_COPY } from '../../constants/login.constants';

const mockRouterReplace = jest.fn();
const mockHasSeenOnboarding = jest.fn();
const mockPersistSession = jest.fn();
const mockSubmitEmailAuth = jest.fn();
const mockVerifyEmailCode = jest.fn();
const mockRequestEmailVerification = jest.fn();
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

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    locale: 'en-US',
    ready: true,
    settings: { language: 'auto', targetLanguage: null },
    setLocale: jest.fn(),
  }),
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
    requestEmailVerification: (...args: unknown[]) => mockRequestEmailVerification(...args),
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
    mockRequestEmailVerification.mockResolvedValue({
      verificationRequired: true as const,
      verificationMethod: 'email_code' as const,
      verificationChannel: 'email' as const,
      verificationExpiresIn: 600,
      verificationId: 'evr_default',
      user: {
        id: 'usr_test',
        email: 'alpha@example.com',
      },
    });
  });

  it('exposes login copy translated by i18n hook', () => {
    const { result } = renderHook(() => useLoginScreen());
    expect(result.current.loginCopy.loginTitle).toBe(LOGIN_COPY.loginTitle);
    expect(result.current.loginCopy.forgotPassword).toBe(LOGIN_COPY.forgotPassword);
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

  it('passes resolved locale when submitting OAuth login', async () => {
    const oauthSession = createSession({
      user: {
        id: 'usr_oauth',
        email: 'oauth@example.com',
      },
    });
    mockSubmitOAuthAuth.mockResolvedValue(oauthSession);

    const { result } = renderHook(() => useLoginScreen());

    await act(async () => {
      await result.current.handleOAuthSignIn('google');
    });

    expect(mockSubmitOAuthAuth).toHaveBeenCalledWith('google', 'en-US');
    expect(mockPersistSession).toHaveBeenCalledWith(oauthSession);
  });

  it('switches to signup and requests verification when login requires email verification', async () => {
    const authError = new AuthApiError(
      'Email verification required before login.',
      'AUTH_EMAIL_NOT_VERIFIED',
      400,
      'req_test',
    );
    mockSubmitEmailAuth.mockRejectedValue(authError);
    mockRequestEmailVerification.mockResolvedValue({
      verificationRequired: true as const,
      verificationMethod: 'email_code' as const,
      verificationChannel: 'email' as const,
      verificationExpiresIn: 600,
      verificationId: 'evr_resend',
      debugCode: '334455',
      user: {
        id: 'usr_test',
        email: 'alpha@example.com',
      },
    });

    const { result } = renderHook(() => useLoginScreen());

    act(() => {
      result.current.setFieldValue('email', 'alpha@example.com');
      result.current.setFieldValue('password', 'Passw0rd!');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.mode).toBe('signup');
    expect(result.current.emailVerificationStepActive).toBe(true);
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.infoMessage).toContain('Verification code sent');
    expect(result.current.formValues.verificationCode).toBe('334455');
    expect(mockRequestEmailVerification).toHaveBeenCalledWith({ email: 'alpha@example.com' });
    expect(mockSetAuthMode).toHaveBeenCalledWith('signup');
  });

  it('requests verification challenge when signup email already exists', async () => {
    const authError = new AuthApiError(
      'Email already exists.',
      'AUTH_EMAIL_ALREADY_EXISTS',
      409,
      'req_signup_exists',
    );
    mockSubmitEmailAuth.mockRejectedValue(authError);
    mockRequestEmailVerification.mockResolvedValue({
      verificationRequired: true as const,
      verificationMethod: 'email_code' as const,
      verificationChannel: 'email' as const,
      verificationExpiresIn: 600,
      verificationId: 'evr_existing_user',
      debugCode: '778899',
      user: {
        id: 'usr_existing',
        email: 'existing@example.com',
      },
    });

    const { result } = renderHook(() => useLoginScreen());

    act(() => {
      result.current.handleSwitchMode('signup');
      result.current.setFieldValue('email', 'existing@example.com');
      result.current.setFieldValue('password', 'Passw0rd!');
      result.current.setFieldValue('confirmPassword', 'Passw0rd!');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.emailVerificationStepActive).toBe(true);
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.infoMessage).toContain('Verification code sent');
    expect(result.current.formValues.verificationCode).toBe('778899');
    expect(mockRequestEmailVerification).toHaveBeenCalledWith({ email: 'existing@example.com' });
  });

  it('resends verification code and refreshes countdown metadata', async () => {
    jest.useFakeTimers();
    try {
      mockSubmitEmailAuth.mockResolvedValue({
        verificationRequired: true as const,
        verificationMethod: 'email_code' as const,
        verificationChannel: 'email' as const,
        verificationExpiresIn: 600,
        verificationId: 'evr_1',
        user: {
          id: 'usr_test',
          email: 'alpha@example.com',
        },
      });
      mockRequestEmailVerification.mockResolvedValue({
        verificationRequired: true as const,
        verificationMethod: 'email_code' as const,
        verificationChannel: 'email' as const,
        verificationExpiresIn: 600,
        verificationId: 'evr_2',
        debugCode: '112233',
        user: {
          id: 'usr_test',
          email: 'alpha@example.com',
        },
      });

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

      expect(result.current.emailVerificationStepActive).toBe(true);
      expect(result.current.verificationCountdownLabel).toBe('10:00');

      await act(async () => {
        jest.advanceTimersByTime(2_000);
      });

      expect(result.current.verificationCountdownLabel).toBe('09:58');

      await act(async () => {
        await result.current.handleResendEmailVerification();
      });

      expect(mockRequestEmailVerification).toHaveBeenCalledWith({ email: 'alpha@example.com' });
      expect(result.current.formValues.verificationCode).toBe('112233');
      expect(result.current.verificationCountdownLabel).toBe('10:00');
    } finally {
      jest.useRealTimers();
    }
  });

  it('stores volatile session when remember me is disabled in login mode', async () => {
    const loginSession = createSession({
      user: {
        id: 'usr_login',
        email: 'login@example.com',
      },
    });
    mockSubmitEmailAuth.mockResolvedValue(loginSession);

    const { result } = renderHook(() => useLoginScreen());

    act(() => {
      result.current.setFieldValue('email', 'login@example.com');
      result.current.setFieldValue('password', 'Passw0rd!');
      result.current.setFieldValue('rememberMe', false);
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockSubmitEmailAuth).toHaveBeenCalledWith({
      mode: 'login',
      values: expect.objectContaining({
        email: 'login@example.com',
        rememberMe: false,
      }),
      locale: 'en-US',
    });
    expect(mockPersistSession).toHaveBeenCalledWith(loginSession, { rememberMe: false });
    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
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

    expect(result.current.passwordResetStepActive).toBe(true);
    expect(result.current.passwordResetCodeSent).toBe(false);
    expect(result.current.formValues.verificationCode).toBe('');

    await act(async () => {
      await result.current.handleResendPasswordReset();
    });

    expect(mockRequestPasswordReset).toHaveBeenCalledWith({
      email: 'reset@example.com',
    });
    expect(result.current.passwordResetCodeSent).toBe(true);
    expect(result.current.formValues.verificationCode).toBe('654321');

    act(() => {
      result.current.setFieldValue('password', 'N3wPassw0rd!');
      result.current.setFieldValue('confirmPassword', 'N3wPassw0rd!');
    });

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

  it('resends password reset code and refreshes countdown metadata', async () => {
    jest.useFakeTimers();
    try {
      mockRequestPasswordReset
        .mockResolvedValueOnce({
          resetRequested: true,
          resetMethod: 'email_code',
          resetChannel: 'email',
          resetExpiresIn: 600,
          resetId: 'prs_1',
          debugCode: '654321',
        })
        .mockResolvedValueOnce({
          resetRequested: true,
          resetMethod: 'email_code',
          resetChannel: 'email',
          resetExpiresIn: 600,
          resetId: 'prs_2',
          debugCode: '112233',
        });

      const { result } = renderHook(() => useLoginScreen());

      act(() => {
        result.current.setFieldValue('email', 'reset@example.com');
      });

      await act(async () => {
        await result.current.handleForgotPassword();
      });

      expect(result.current.passwordResetStepActive).toBe(true);
      expect(result.current.verificationCountdownLabel).toBeNull();

      await act(async () => {
        await result.current.handleResendPasswordReset();
      });

      expect(result.current.verificationCountdownLabel).toBe('10:00');
      expect(result.current.formValues.verificationCode).toBe('654321');

      await act(async () => {
        jest.advanceTimersByTime(2_000);
      });

      expect(result.current.verificationCountdownLabel).toBe('09:58');

      await act(async () => {
        await result.current.handleResendPasswordReset();
      });

      expect(mockRequestPasswordReset).toHaveBeenNthCalledWith(2, {
        email: 'reset@example.com',
      });
      expect(result.current.formValues.verificationCode).toBe('112233');
      expect(result.current.verificationCountdownLabel).toBe('10:00');
    } finally {
      jest.useRealTimers();
    }
  });

  it('enters reset step and keeps verification empty when reset challenge debug code is omitted', async () => {
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

    await act(async () => {
      await result.current.handleResendPasswordReset();
    });

    expect(result.current.passwordResetStepActive).toBe(true);
    expect(result.current.passwordResetCodeSent).toBe(true);
    expect(result.current.formValues.verificationCode).toBe('');
  });

  it('blocks reset confirmation until reset code is requested from reset page', async () => {
    const { result } = renderHook(() => useLoginScreen());

    act(() => {
      result.current.setFieldValue('email', 'wait@example.com');
    });

    await act(async () => {
      await result.current.handleForgotPassword();
    });

    act(() => {
      result.current.setFieldValue('password', 'N3wPassw0rd!');
      result.current.setFieldValue('confirmPassword', 'N3wPassw0rd!');
      result.current.setFieldValue('verificationCode', '123123');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe('Request a reset code first.');
  });

  it('validates reset password confirmation mismatch', async () => {
    mockRequestPasswordReset.mockResolvedValue({
      resetRequested: true,
      resetMethod: 'email_code',
      resetChannel: 'email',
      resetExpiresIn: 600,
      resetId: 'prs_2',
      debugCode: '123123',
    });

    const { result } = renderHook(() => useLoginScreen());

    act(() => {
      result.current.setFieldValue('email', 'mismatch@example.com');
    });

    await act(async () => {
      await result.current.handleForgotPassword();
    });

    await act(async () => {
      await result.current.handleResendPasswordReset();
    });

    act(() => {
      result.current.setFieldValue('password', 'N3wPassw0rd!');
      result.current.setFieldValue('confirmPassword', 'DifferentPass1!');
      result.current.setFieldValue('verificationCode', '123123');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe('New password and confirm password do not match.');
  });

  it('auto clears invalid reset email message after 3 seconds', async () => {
    jest.useFakeTimers();

    try {
      const { result } = renderHook(() => useLoginScreen());

      act(() => {
        result.current.setFieldValue('email', 'invalid-email');
      });

      await act(async () => {
        await result.current.handleForgotPassword();
      });

      expect(result.current.errorMessage).toBe('Enter a valid email address to reset your password.');

      await act(async () => {
        jest.advanceTimersByTime(LOGIN_ALERT_AUTO_DISMISS_MS);
      });

      expect(result.current.errorMessage).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
