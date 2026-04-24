import { AppState } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useProfileHubController } from '../useProfileHubController';

const mockLoadProfile = jest.fn();
const mockInvalidateProfileLoad = jest.fn();
const mockResetLocalEdits = jest.fn();
const mockSetTravelerLangModalVisible = jest.fn();
const mockSetUiLangModalVisible = jest.fn();
const mockOpenSheet = jest.fn();
const mockRemoveAppStateListener = jest.fn();

let capturedFocusEffect:
  | (() => void | (() => void))
  | null = null;
let capturedAppStateHandler: ((nextAppState: string) => void) | null = null;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    capturedFocusEffect = effect;
  },
}));

jest.mock('../useProfileHubState', () => ({
  useProfileHubState: () => ({
    invalidateProfileLoad: mockInvalidateProfileLoad,
    loadProfile: mockLoadProfile,
    resetLocalEdits: mockResetLocalEdits,
    travelerLangModalVisible: false,
    uiLangModalVisible: false,
    setTravelerLangModalVisible: mockSetTravelerLangModalVisible,
    setUiLangModalVisible: mockSetUiLangModalVisible,
  }),
}));

jest.mock('../useModalSheetGesture', () => ({
  useModalSheetGesture: () => ({
    openSheet: mockOpenSheet,
  }),
}));

describe('useProfileHubController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    capturedFocusEffect = null;
    capturedAppStateHandler = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((eventType, handler) => {
      if (eventType === 'change') {
        capturedAppStateHandler = handler as (nextAppState: string) => void;
      }

      return {
        remove: mockRemoveAppStateListener,
      };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('only starts profile polling while the tab is focused', () => {
    const { unmount } = renderHook(() =>
      useProfileHubController({ userId: 'usr_profile', initialState: undefined })
    );

    expect(mockLoadProfile).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(mockLoadProfile).toHaveBeenCalledTimes(1);

    expect(capturedFocusEffect).not.toBeNull();
    const cleanup = capturedFocusEffect?.();

    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
    expect(mockLoadProfile).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(mockLoadProfile).toHaveBeenCalledTimes(2);

    act(() => {
      capturedAppStateHandler?.('active');
    });
    expect(mockLoadProfile).toHaveBeenCalledTimes(2);

    cleanup?.();

    act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(mockLoadProfile).toHaveBeenCalledTimes(2);
    expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);

    const revisitCleanup = capturedFocusEffect?.();
    expect(mockLoadProfile).toHaveBeenCalledTimes(3);

    act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(mockLoadProfile).toHaveBeenCalledTimes(4);
    revisitCleanup?.();

    unmount();
  });
});
