import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import FloatingBottomNav, {
  getBottomNavBarHeight,
  getBottomNavInteractivePadding,
  getBottomNavOuterGutter,
  getBottomNavPosition,
  getBottomNavWidth,
} from '../FloatingBottomNav';

const mockedPush = jest.fn();
const mockedReplace = jest.fn();
const mockedNavigate = jest.fn();
const mockedPrefetch = jest.fn();
const mockedStartTopLevelTabSwitchTrace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: mockedNavigate,
    prefetch: mockedPrefetch,
    push: mockedPush,
    replace: mockedReplace,
  }),
}));

jest.mock('expo-linear-gradient', () => {
  const ReactModule = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  return {
    LinearGradient: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, null, children),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'light',
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

jest.mock('@/services/haptics', () => ({
  HapticsService: {
    light: jest.fn(),
    tickTick: jest.fn(),
  },
}));

jest.mock('../tabSwitchTrace', () => ({
  startTopLevelTabSwitchTrace: (...args: unknown[]) => mockedStartTopLevelTabSwitchTrace(...args),
}));

const collectAccessibilityLabels = (node: unknown): string[] => {
  if (!node || typeof node !== 'object') {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap(collectAccessibilityLabels);
  }

  const candidate = node as {
    props?: { accessibilityLabel?: string };
    children?: unknown[];
  };
  const currentLabel = candidate.props?.accessibilityLabel;
  const childLabels = (candidate.children ?? []).flatMap(collectAccessibilityLabels);

  if (typeof currentLabel === 'string') {
    return [currentLabel, ...childLabels];
  }

  return childLabels;
};

describe('FloatingBottomNav', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
  });

  it('prefetches inactive top-level destinations on mount', () => {
    render(<FloatingBottomNav activeItem="home" />);

    expect(mockedPrefetch).toHaveBeenCalledTimes(3);
    expect(mockedPrefetch).toHaveBeenNthCalledWith(1, '/allergies');
    expect(mockedPrefetch).toHaveBeenNthCalledWith(2, '/history');
    expect(mockedPrefetch).toHaveBeenNthCalledWith(3, '/profile');
  });

  it('switches top-level destinations with navigate semantics', () => {
    const { getByLabelText } = render(<FloatingBottomNav activeItem="home" />);

    fireEvent.press(getByLabelText('Start analysis'));
    fireEvent.press(getByLabelText('History'));
    fireEvent.press(getByLabelText('Profile'));

    expect(mockedPush).toHaveBeenNthCalledWith(1, '/scan/camera');
    expect(mockedStartTopLevelTabSwitchTrace).toHaveBeenNthCalledWith(1, {
      source: 'home',
      target: 'history',
    });
    expect(mockedStartTopLevelTabSwitchTrace).toHaveBeenNthCalledWith(2, {
      source: 'home',
      target: 'profile',
    });
    expect(mockedNavigate).toHaveBeenNthCalledWith(1, '/history');
    expect(mockedNavigate).toHaveBeenNthCalledWith(2, '/profile');
  });

  it('does not re-push the active item', () => {
    const { getByLabelText } = render(<FloatingBottomNav activeItem="history" />);

    fireEvent.press(getByLabelText('History'));

    expect(mockedPush).not.toHaveBeenCalled();
    expect(mockedNavigate).not.toHaveBeenCalled();
    expect(mockedReplace).not.toHaveBeenCalled();
    expect(mockedStartTopLevelTabSwitchTrace).not.toHaveBeenCalled();
  });

  it('returns to home with navigate semantics', () => {
    const { getByLabelText } = render(<FloatingBottomNav activeItem="history" />);

    fireEvent.press(getByLabelText('Home'));

    expect(mockedStartTopLevelTabSwitchTrace).toHaveBeenCalledWith({
      source: 'history',
      target: 'home',
    });
    expect(mockedNavigate).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith('/(tabs)');
    expect(mockedPush).not.toHaveBeenCalled();
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('renders short labels for every anchored nav item', () => {
    const { getByText } = render(<FloatingBottomNav activeItem="home" />);

    expect(getByText('Scan')).toBeTruthy();
    expect(getByText('Home')).toBeTruthy();
    expect(getByText('History')).toBeTruthy();
    expect(getByText('Allergies')).toBeTruthy();
    expect(getByText('Profile')).toBeTruthy();
  });

  it('renders nav items in the requested order', () => {
    const { toJSON } = render(<FloatingBottomNav activeItem="home" />);
    const buttonLabels = collectAccessibilityLabels(toJSON());

    expect(buttonLabels).toEqual(['Home', 'Allergies', 'Start analysis', 'History', 'Profile']);
  });

  it('uses the Android width-class gutter rules across platforms', () => {
    expect(getBottomNavOuterGutter(384)).toBe(0);
    expect(getBottomNavOuterGutter(700)).toBe(16);
    expect(getBottomNavOuterGutter(900)).toBe(24);

    expect(getBottomNavWidth(384)).toBe(384);
    expect(getBottomNavWidth(700)).toBe(668);
    expect(getBottomNavWidth(900)).toBe(852);
  });

  it('keeps the flat bar content above the safe-area inset', () => {
    expect(getBottomNavPosition(0)).toBe(0);
    expect(getBottomNavPosition(24)).toBe(0);
    expect(getBottomNavInteractivePadding(0)).toBe(12);
    expect(getBottomNavInteractivePadding(24)).toBe(24);
    expect(getBottomNavBarHeight(0)).toBe(70);
    expect(getBottomNavBarHeight(24)).toBe(82);
  });
});
