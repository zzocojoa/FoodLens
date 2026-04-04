/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';
import { LOGIN_ANIMATION } from '../../constants/login.constants';
import { useLoginMotion } from '../useLoginMotion';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }),
}));

describe('useLoginMotion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('enables welcome interaction after entrance delay', () => {
    const { result, unmount } = renderHook(() => useLoginMotion());

    expect(result.current.welcomeInteractive).toBe(false);
    expect(result.current.authInteractive).toBe(false);

    act(() => {
      jest.advanceTimersByTime(LOGIN_ANIMATION.welcomeDelayMs);
    });

    expect(result.current.welcomeInteractive).toBe(true);
    expect(result.current.authInteractive).toBe(false);

    unmount();
  });

  it('switches to auth interaction when goToAuth is called', () => {
    const { result, unmount } = renderHook(() => useLoginMotion());

    act(() => {
      jest.advanceTimersByTime(LOGIN_ANIMATION.welcomeDelayMs);
    });

    act(() => {
      result.current.goToAuth('signup');
    });

    expect(result.current.authInteractive).toBe(true);
    expect(result.current.welcomeInteractive).toBe(false);

    unmount();
  });

  it('returns to welcome interaction when goBackToWelcome is called', () => {
    const { result, unmount } = renderHook(() => useLoginMotion());

    act(() => {
      jest.advanceTimersByTime(LOGIN_ANIMATION.welcomeDelayMs);
    });

    act(() => {
      result.current.goToAuth('login');
    });

    expect(result.current.authInteractive).toBe(true);

    act(() => {
      result.current.goBackToWelcome();
    });

    expect(result.current.authInteractive).toBe(false);
    expect(result.current.welcomeInteractive).toBe(true);

    unmount();
  });
});
