import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import FloatingBottomNav, {
  getAndroidBarHeight,
  getAndroidBarWidth,
  getAndroidBottomNavInteractivePadding,
  getAndroidBottomNavOuterGutter,
} from '../FloatingBottomNav';

const mockedPush = jest.fn();
const mockedReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockedPush,
    replace: mockedReplace,
  }),
}));

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    LinearGradient: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
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

  it('switches Android top-level destinations with replace semantics', () => {
    const { getByLabelText } = render(<FloatingBottomNav activeItem="home" />);

    fireEvent.press(getByLabelText('Start analysis'));
    fireEvent.press(getByLabelText('History'));
    fireEvent.press(getByLabelText('Profile'));

    expect(mockedPush).toHaveBeenNthCalledWith(1, '/scan/camera');
    expect(mockedReplace).toHaveBeenNthCalledWith(1, '/history');
    expect(mockedReplace).toHaveBeenNthCalledWith(2, '/profile');
  });

  it('does not re-push the active item', () => {
    const { getByLabelText } = render(<FloatingBottomNav activeItem="history" />);

    fireEvent.press(getByLabelText('History'));

    expect(mockedPush).not.toHaveBeenCalled();
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('returns to home with replace semantics on Android', () => {
    const { getByLabelText } = render(<FloatingBottomNav activeItem="history" />);

    fireEvent.press(getByLabelText('Home'));

    expect(mockedReplace).toHaveBeenCalledTimes(1);
    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockedPush).not.toHaveBeenCalled();
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

  it('derives Android width from width-class gutter rules instead of slot math', () => {
    expect(getAndroidBottomNavOuterGutter(384)).toBe(0);
    expect(getAndroidBottomNavOuterGutter(700)).toBe(16);
    expect(getAndroidBottomNavOuterGutter(900)).toBe(24);

    expect(getAndroidBarWidth(384)).toBe(384);
    expect(getAndroidBarWidth(700)).toBe(668);
    expect(getAndroidBarWidth(900)).toBe(852);
  });

  it('keeps Android interactive content above the navigation inset area', () => {
    expect(getAndroidBottomNavInteractivePadding(0)).toBe(12);
    expect(getAndroidBottomNavInteractivePadding(24)).toBe(24);

    expect(getAndroidBarHeight(0)).toBe(70);
    expect(getAndroidBarHeight(24)).toBe(82);
  });
});
