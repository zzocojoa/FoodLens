import React from 'react';
import { Alert } from 'react-native';
import { act, render } from '@testing-library/react-native';
import ProfileSheet from '../ProfileSheet';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockAuthLogout = jest.fn();
const mockReadSession = jest.fn();
const mockClearSession = jest.fn();
const mockProviderLogout = jest.fn();
const mockDispatchPhase2SyncQueue = jest.fn();

let capturedProps: {
  onPressManageProfile: () => void;
  onPressHelpCenter: () => void;
  onPressSupportContact: () => void;
  onPressAccountData: () => void;
  onPressLogout: () => void;
} | null = null;

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
    onPressHelpCenter: () => void;
    onPressSupportContact: () => void;
    onPressAccountData: () => void;
    onPressLogout: () => void;
  }) => {
    capturedProps = props;
    return null;
  };
  return MockProfileSheetView;
});

describe('ProfileSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedProps = null;
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

  it('calls provider logout after local logout for social account', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const continueButton = buttons?.find((button) => button.text === 'Continue');
      continueButton?.onPress?.();
    });

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

    alertSpy.mockRestore();
  });

  it('routes to health, help, support, and account-data screens from the sheet', () => {
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
    capturedProps?.onPressHelpCenter();
    capturedProps?.onPressSupportContact();
    capturedProps?.onPressAccountData();

    expect(mockPush).toHaveBeenNthCalledWith(1, {
      pathname: '/profile',
      params: { fromProfileSheet: '1' },
    });
    expect(mockPush).toHaveBeenNthCalledWith(2, '/help/faq');
    expect(mockPush).toHaveBeenNthCalledWith(3, '/help/contact');
    expect(mockPush).toHaveBeenNthCalledWith(4, {
      pathname: '/account-data',
      params: { fromProfileSheet: '1' },
    });
  });
});
