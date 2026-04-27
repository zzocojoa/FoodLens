import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Modal, ScrollView } from 'react-native';

import LogoutConfirmationDialog from '../LogoutConfirmationDialog';

const mockEnTranslations = jest.requireActual('../../../i18n/resources/en.json') as Record<string, string>;

type BuildDialogPropsParams = {
    visible: boolean;
    onCancel: () => void;
    onConfirm: () => void;
};
type LogoutConfirmationDialogProps = React.ComponentProps<typeof LogoutConfirmationDialog>;

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/components/HapticFeedback', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');

    type MockHapticTouchableOpacityProps = React.ComponentProps<typeof ReactNative.TouchableOpacity> & {
        hapticType: string;
    };

    return {
        HapticTouchableOpacity: ({ children, hapticType, ...props }: MockHapticTouchableOpacityProps) => {
            void hapticType;
            return React.createElement(ReactNative.TouchableOpacity, props, children);
        },
    };
});

const buildDialogProps = ({
    visible,
    onCancel,
    onConfirm,
}: BuildDialogPropsParams): LogoutConfirmationDialogProps => ({
    visible,
    colorScheme: 'light' as const,
    title: mockEnTranslations['profileHub.logout.confirmTitle'],
    message: mockEnTranslations['profileHub.logout.confirmMessage'],
    cancelLabel: mockEnTranslations['common.cancel'],
    confirmLabel: mockEnTranslations['profileHub.menu.logout.title'],
    dialogAccessibilityLabel: mockEnTranslations['profileHub.logout.dialogAccessibilityLabel'],
    cancelAccessibilityLabel: mockEnTranslations['profileHub.logout.cancelAccessibilityLabel'],
    cancelAccessibilityHint: mockEnTranslations['profileHub.logout.cancelAccessibilityHint'],
    confirmAccessibilityLabel: mockEnTranslations['profileHub.logout.confirmAccessibilityLabel'],
    confirmAccessibilityHint: mockEnTranslations['profileHub.logout.confirmAccessibilityHint'],
    onCancel,
    onConfirm,
});

describe('LogoutConfirmationDialog', () => {
    beforeEach(() => {
        jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not render content while hidden', () => {
        const props = buildDialogProps({
            visible: false,
            onCancel: jest.fn(),
            onConfirm: jest.fn(),
        });

        const { queryByLabelText, queryByText } = render(<LogoutConfirmationDialog {...props} />);

        expect(queryByLabelText(mockEnTranslations['profileHub.logout.dialogAccessibilityLabel'])).toBeNull();
        expect(queryByText(mockEnTranslations['profileHub.logout.confirmTitle'])).toBeNull();
    });

    it('renders resource-backed labels and wires cancel, confirm, and Android back dismissal', () => {
        const onCancel = jest.fn();
        const onConfirm = jest.fn();
        const props = buildDialogProps({
            visible: true,
            onCancel,
            onConfirm,
        });

        const { UNSAFE_getByType, getByLabelText, getByText } = render(<LogoutConfirmationDialog {...props} />);

        expect(getByLabelText(mockEnTranslations['profileHub.logout.dialogAccessibilityLabel'])).toBeTruthy();
        expect(getByText(mockEnTranslations['profileHub.logout.confirmTitle'])).toBeTruthy();
        expect(getByText(mockEnTranslations['profileHub.logout.confirmMessage'])).toBeTruthy();

        fireEvent.press(getByLabelText(mockEnTranslations['profileHub.logout.cancelAccessibilityLabel']));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();

        fireEvent.press(getByLabelText(mockEnTranslations['profileHub.logout.confirmAccessibilityLabel']));
        expect(onConfirm).toHaveBeenCalledTimes(1);

        UNSAFE_getByType(Modal).props.onRequestClose();
        expect(onCancel).toHaveBeenCalledTimes(2);
    });

    it('keeps the standard confirmation dialog non-scrollable without line caps', () => {
        const props = buildDialogProps({
            visible: true,
            onCancel: jest.fn(),
            onConfirm: jest.fn(),
        });

        const { UNSAFE_queryByType, getByText } = render(<LogoutConfirmationDialog {...props} />);

        expect(UNSAFE_queryByType(ScrollView)).toBeNull();
        expect(getByText(mockEnTranslations['profileHub.logout.confirmTitle']).props.numberOfLines).toBeUndefined();
        expect(getByText(mockEnTranslations['profileHub.logout.confirmMessage']).props.numberOfLines).toBeUndefined();
        expect(getByText(mockEnTranslations['common.cancel']).props.numberOfLines).toBeUndefined();
        expect(getByText(mockEnTranslations['profileHub.menu.logout.title']).props.numberOfLines).toBeUndefined();
    });
});
