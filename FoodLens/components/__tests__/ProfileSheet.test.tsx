import React from 'react';
import { act, render } from '@testing-library/react-native';
import ProfileSheet from '../ProfileSheet';

const mockEnTranslations = jest.requireActual('../../features/i18n/resources/en.json') as Record<string, string>;
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockAuthLogout = jest.fn();
const mockReadSession = jest.fn();
const mockClearSession = jest.fn();
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
}));

jest.mock('@/services/auth/secureSessionStore', () => ({
  AuthSecureSessionStore: {
    read: (...args: unknown[]) => mockReadSession(...args),
  },
}));

jest.mock('@/services/auth/sessionManager', () => ({
  clearSession: (...args: unknown[]) => mockClearSession(...args),
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
    mockClearSession.mockResolvedValue(undefined);
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
    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(mockProviderLogout).toHaveBeenCalledWith('google');
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
    expect(mockClearSession).not.toHaveBeenCalled();
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
    expect(mockClearSession).not.toHaveBeenCalled();
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
