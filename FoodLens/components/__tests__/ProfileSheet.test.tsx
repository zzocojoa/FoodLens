import React from 'react';
import { Alert } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { AuthApiError } from '@/services/auth/authApi';
import ProfileSheet from '../ProfileSheet';

const mockEnTranslations = jest.requireActual('../../features/i18n/resources/en.json') as Record<string, string>;
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockAuthLogout = jest.fn();
const mockReadSession = jest.fn();
const mockClearLocalLogoutFootprint = jest.fn();
const mockProviderLogout = jest.fn();
const mockDispatchPhase2SyncQueue = jest.fn();
const mockTranslate = jest.fn((key: string, fallback?: string): string => mockEnTranslations[key] ?? fallback ?? key);

type LogoutConfirmationDialogTestProps = {
  visible: boolean;
  colorScheme: 'light' | 'dark';
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  dialogAccessibilityLabel: string;
  cancelAccessibilityLabel: string;
  cancelAccessibilityHint: string;
  confirmAccessibilityLabel: string;
  confirmAccessibilityHint: string;
  onCancel: () => void;
  onConfirm: () => void;
};

let capturedProps: {
  onPressManageProfile: () => void;
  onPressSupportHub: () => void;
  onPressLogout: () => void;
} | null = null;
let mockCapturedLogoutDialogProps: LogoutConfirmationDialogTestProps | null = null;

const flushLogoutPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: jest.fn(),
    colorScheme: 'light',
  }),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: mockTranslate,
  }),
}));

jest.mock('@/services/auth/authApi', () => ({
  AuthApi: {
    logout: (...args: unknown[]) => mockAuthLogout(...args),
  },
  AuthApiError: class MockAuthApiError extends Error {
    code: string;
    status: number;
    requestId?: string;

    constructor(message: string, code: string, status: number, requestId?: string) {
      super(message);
      this.name = 'AuthApiError';
      this.code = code;
      this.status = status;
      this.requestId = requestId;
    }
  },
}));

jest.mock('@/services/auth/secureSessionStore', () => ({
  AuthSecureSessionStore: {
    read: (...args: unknown[]) => mockReadSession(...args),
  },
}));

jest.mock('@/services/auth/localFootprint', () => ({
  clearLocalLogoutFootprint: (...args: unknown[]) => mockClearLocalLogoutFootprint(...args),
}));

jest.mock('@/services/auth/providerLogout', () => ({
  logoutFromOAuthProvider: (...args: unknown[]) => mockProviderLogout(...args),
}));

jest.mock('@/services/sync/phase2SyncQueue', () => ({
  dispatchPhase2SyncQueue: (...args: unknown[]) => mockDispatchPhase2SyncQueue(...args),
}));

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: jest.fn(),
    getSync: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('../profileSheet/hooks/useProfileSheetController', () => ({
  useProfileSheetController: () => ({
    state: {
      travelerLanguage: 'en',
      uiLanguage: 'en',
      loading: false,
      handleUpdate: jest.fn(),
    },
    profileSheet: {
      closeSheet: jest.fn(),
      panY: { __mock: 'profile-pan' },
      panResponder: { panHandlers: {} },
    },
    travelerLanguageSheet: {
      closeSheet: jest.fn(),
      panY: { __mock: 'traveler-pan' },
      panResponder: { panHandlers: {} },
    },
    uiLanguageSheet: {
      closeSheet: jest.fn(),
      panY: { __mock: 'ui-pan' },
      panResponder: { panHandlers: {} },
    },
  }),
}));

jest.mock('../profileSheet/components/ProfileSheetView', () => {
  const MockProfileSheetView = (props: {
    onPressManageProfile: () => void;
    onPressSupportHub: () => void;
    onPressLogout: () => void;
  }) => {
    capturedProps = props;
    return null;
  };
  return MockProfileSheetView;
});

jest.mock('@/features/profile/components/LogoutConfirmationDialog', () => {
  const MockLogoutConfirmationDialog = (props: LogoutConfirmationDialogTestProps) => {
    mockCapturedLogoutDialogProps = props;
    return null;
  };
  return MockLogoutConfirmationDialog;
});

describe('ProfileSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedProps = null;
    mockCapturedLogoutDialogProps = null;
    global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    }) as typeof requestAnimationFrame;
    mockReadSession.mockResolvedValue({
      accessToken: 'atk_profile',
      refreshToken: 'rtk_profile',
      user: {
        id: 'usr_profile',
        provider: 'google',
      },
    });
    mockAuthLogout.mockResolvedValue(undefined);
    mockClearLocalLogoutFootprint.mockResolvedValue(undefined);
    mockProviderLogout.mockResolvedValue(undefined);
    mockDispatchPhase2SyncQueue.mockResolvedValue(undefined);
  });

  it('passes localized logout dialog copy and accessibility labels from i18n resources', () => {
    render(
      <ProfileSheet
        isOpen
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(mockCapturedLogoutDialogProps).toMatchObject({
      visible: false,
      colorScheme: 'light',
      title: mockEnTranslations['profileSheet.logout.confirmTitle'],
      message: mockEnTranslations['profileSheet.logout.confirmMessage'],
      cancelLabel: mockEnTranslations['common.cancel'],
      confirmLabel: mockEnTranslations['profileSheet.menu.logout.title'],
      dialogAccessibilityLabel: mockEnTranslations['profileSheet.logout.dialogAccessibilityLabel'],
      cancelAccessibilityLabel: mockEnTranslations['profileSheet.logout.cancelAccessibilityLabel'],
      cancelAccessibilityHint: mockEnTranslations['profileSheet.logout.cancelAccessibilityHint'],
      confirmAccessibilityLabel: mockEnTranslations['profileSheet.logout.confirmAccessibilityLabel'],
      confirmAccessibilityHint: mockEnTranslations['profileSheet.logout.confirmAccessibilityHint'],
    });
  });

  it('calls provider logout after local logout for social account', async () => {
    render(
      <ProfileSheet
        isOpen
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(capturedProps).not.toBeNull();

    await act(async () => {
      capturedProps?.onPressLogout();
    });

    expect(mockCapturedLogoutDialogProps?.visible).toBe(true);

    await act(async () => {
      mockCapturedLogoutDialogProps?.onConfirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAuthLogout).toHaveBeenCalledWith({
      accessToken: 'atk_profile',
      refreshToken: 'rtk_profile',
    });
    expect(mockDispatchPhase2SyncQueue).toHaveBeenCalledTimes(1);
    expect(mockClearLocalLogoutFootprint).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(mockProviderLogout).toHaveBeenCalledWith('google');
  });

  it('keeps local session and shows retryable error when server logout fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockAuthLogout.mockRejectedValueOnce(new Error('server revoke failed'));
    render(
      <ProfileSheet
        isOpen
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(capturedProps).not.toBeNull();

    await act(async () => {
      capturedProps?.onPressLogout();
    });

    await act(async () => {
      mockCapturedLogoutDialogProps?.onConfirm();
      await flushLogoutPromises();
    });

    expect(mockDispatchPhase2SyncQueue).toHaveBeenCalledTimes(1);
    expect(mockAuthLogout).toHaveBeenCalledTimes(1);
    expect(mockClearLocalLogoutFootprint).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockProviderLogout).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      mockEnTranslations['profileSheet.logout.serverLogoutFailed.title'],
      mockEnTranslations['profileSheet.logout.serverLogoutFailed.message'],
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[AuthSession] FoodLens server logout failed',
      expect.objectContaining({
        request_id: expect.stringMatching(/^auth-logout-/),
        user_id: 'usr_profile',
        provider: 'google',
        phase: 'server_refresh_token_revoke',
        error: 'server revoke failed',
      }),
    );

    alertSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('keeps local session and shows retryable error when network logout fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockAuthLogout.mockRejectedValue(
      new AuthApiError('Network unavailable.', 'AUTH_NETWORK_ERROR', 0, 'req-network'),
    );
    render(
      <ProfileSheet
        isOpen
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(capturedProps).not.toBeNull();

    await act(async () => {
      capturedProps?.onPressLogout();
    });

    await act(async () => {
      mockCapturedLogoutDialogProps?.onConfirm();
      await flushLogoutPromises();
    });

    expect(mockDispatchPhase2SyncQueue).toHaveBeenCalledTimes(1);
    expect(mockAuthLogout).toHaveBeenCalledTimes(2);
    expect(mockClearLocalLogoutFootprint).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockProviderLogout).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      mockEnTranslations['profileSheet.logout.serverLogoutFailed.title'],
      mockEnTranslations['profileSheet.logout.serverLogoutFailed.message'],
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[AuthSession] FoodLens server logout failed',
      expect.objectContaining({
        request_id: expect.stringMatching(/^auth-logout-/),
        user_id: 'usr_profile',
        provider: 'google',
        phase: 'server_refresh_token_revoke',
        code: 'AUTH_NETWORK_ERROR',
        status: 0,
        server_request_id: 'req-network',
      }),
    );

    alertSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('routes to login when provider logout fails after server logout succeeds', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockProviderLogout.mockRejectedValueOnce(new Error('provider bridge failed'));
    render(
      <ProfileSheet
        isOpen
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(capturedProps).not.toBeNull();

    await act(async () => {
      capturedProps?.onPressLogout();
    });

    await act(async () => {
      mockCapturedLogoutDialogProps?.onConfirm();
      await flushLogoutPromises();
    });

    expect(mockAuthLogout).toHaveBeenCalledTimes(1);
    expect(mockClearLocalLogoutFootprint).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(mockProviderLogout).toHaveBeenCalledWith('google');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[AuthSession] Provider logout failed after FoodLens logout',
      expect.objectContaining({
        request_id: expect.stringMatching(/^auth-logout-/),
        user_id: 'usr_profile',
        provider: 'google',
        phase: 'provider_logout',
        error: 'provider bridge failed',
      }),
    );

    consoleWarnSpy.mockRestore();
  });

  it('does not route to login when local logout footprint clear fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockClearLocalLogoutFootprint.mockRejectedValueOnce(new Error('local wipe failed'));
    render(
      <ProfileSheet
        isOpen
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(capturedProps).not.toBeNull();

    await act(async () => {
      capturedProps?.onPressLogout();
    });

    await act(async () => {
      mockCapturedLogoutDialogProps?.onConfirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAuthLogout).toHaveBeenCalledTimes(1);
    expect(mockClearLocalLogoutFootprint).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockProviderLogout).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[AuthSession] Local logout footprint wipe failed',
      expect.objectContaining({
        request_id: expect.stringMatching(/^auth-logout-/),
        provider: 'google',
        error: 'local wipe failed',
      }),
    );

    consoleErrorSpy.mockRestore();
  });

  it('keeps the session when logout confirmation is cancelled', async () => {
    render(
      <ProfileSheet
        isOpen
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(capturedProps).not.toBeNull();

    await act(async () => {
      capturedProps?.onPressLogout();
    });

    expect(mockCapturedLogoutDialogProps?.visible).toBe(true);

    await act(async () => {
      mockCapturedLogoutDialogProps?.onCancel();
    });

    expect(mockAuthLogout).not.toHaveBeenCalled();
    expect(mockClearLocalLogoutFootprint).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('hides the logout confirmation when the profile sheet closes', async () => {
    const { rerender } = render(
      <ProfileSheet
        isOpen
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(capturedProps).not.toBeNull();

    await act(async () => {
      capturedProps?.onPressLogout();
    });

    expect(mockCapturedLogoutDialogProps?.visible).toBe(true);

    rerender(
      <ProfileSheet
        isOpen={false}
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(mockCapturedLogoutDialogProps?.visible).toBe(false);

    rerender(
      <ProfileSheet
        isOpen
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(mockCapturedLogoutDialogProps?.visible).toBe(false);
    expect(mockAuthLogout).not.toHaveBeenCalled();
    expect(mockClearLocalLogoutFootprint).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('routes to health and support hub screens from the sheet', () => {
    render(
      <ProfileSheet
        isOpen
        onClose={jest.fn()}
        userId="usr_profile"
        onUpdate={jest.fn()}
      />
    );

    expect(capturedProps).not.toBeNull();

    capturedProps?.onPressManageProfile();
    capturedProps?.onPressSupportHub();

    expect(mockPush).toHaveBeenNthCalledWith(1, {
      pathname: '/profile',
      params: { fromProfileSheet: '1' },
    });
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/support-policies',
      params: { fromProfileSheet: '1' },
    });
  });
});
