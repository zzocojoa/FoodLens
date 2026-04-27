import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import ProfileSheetMenuItem from '../ProfileMenuItem';
import ProfileHubMenuItem from '../../../../features/profile/profileHub/components/ProfileMenuItem';

type ProfileMenuItemComponent = typeof ProfileSheetMenuItem;

type ProfileMenuItemCase = {
    name: string;
    Component: ProfileMenuItemComponent;
};

const testCases: ProfileMenuItemCase[] = [
    { name: 'profile sheet menu item', Component: ProfileSheetMenuItem },
    { name: 'profile hub menu item', Component: ProfileHubMenuItem },
];

const theme = {
    surface: '#FFFFFF',
    border: '#E2E8F0',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
};

jest.mock('@/components/HapticFeedback', () => {
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        HapticPressable: ({ children, hapticType, ...props }: React.ComponentProps<typeof ReactNative.Pressable> & { hapticType: string }) => {
            void hapticType;
            return <ReactNative.Pressable testID="menu-item-pressable" {...props}>{children}</ReactNative.Pressable>;
        },
    };
});

jest.mock('lucide-react-native', () => {
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ChevronRight: () => <ReactNative.Text testID="menu-item-chevron">chevron</ReactNative.Text>,
    };
});

const renderMenuItem = (Component: ProfileMenuItemComponent, onPress?: () => void) => render(
    <Component
        icon={<Text>icon</Text>}
        title="Profile row"
        subtitle="Row detail"
        onPress={onPress}
        iconBgColor="#F1F5F9"
        theme={theme}
        accessibilityLabel="Open profile row"
        accessibilityHint="Opens profile details"
    />
);

describe.each(testCases)('$name', ({ Component }) => {
    beforeEach(() => {
        jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
            callback(0);
            return 0;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('renders actionable rows as buttons with a chevron', () => {
        const onPress = jest.fn();
        const { getByTestId } = renderMenuItem(Component, onPress);

        const pressable = getByTestId('menu-item-pressable');
        fireEvent.press(pressable);

        expect(pressable.props.accessibilityRole).toBe('button');
        expect(getByTestId('menu-item-chevron')).toBeTruthy();
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('renders non-action rows without a button role or chevron', () => {
        const { queryByTestId } = renderMenuItem(Component);

        expect(queryByTestId('menu-item-pressable')).toBeNull();
        expect(queryByTestId('menu-item-chevron')).toBeNull();
    });
});
