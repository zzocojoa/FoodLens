import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import SupportPoliciesScreen from '../SupportPoliciesScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockLocalSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: mockPush,
        back: mockBack,
        replace: mockReplace,
    }),
    useLocalSearchParams: () => mockLocalSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        colorScheme: 'light',
    }),
}));

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

jest.mock('@/components/HapticFeedback', () => {
    const ReactNative = jest.requireActual('react-native');

    return {
        HapticPressable: ({ children, ...props }: React.ComponentProps<typeof ReactNative.Pressable>) => (
            <ReactNative.Pressable {...props}>{children}</ReactNative.Pressable>
        ),
    };
});

jest.mock('../../components/ProfileHeader', () => {
    const mockReactNative = jest.requireActual('react-native');
    const MockPressable = mockReactNative.Pressable;
    const MockText = mockReactNative.Text;

    type MockProfileHeaderProps = {
        onBack: () => void;
        title: string;
    };

    return function MockProfileHeader({ onBack, title }: MockProfileHeaderProps) {
        return (
            <>
                <MockPressable accessibilityRole="button" onPress={onBack}>
                    <MockText>Back</MockText>
                </MockPressable>
                <MockText>{title}</MockText>
            </>
        );
    };
});

describe('SupportPoliciesScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLocalSearchParams = {};
        global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        }) as typeof requestAnimationFrame;
    });

    it('routes to support, legal, and account destinations from the hub', () => {
        const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
        const { getByText } = render(<SupportPoliciesScreen />);

        fireEvent.press(getByText('Help Center'));
        fireEvent.press(getByText('Contact Support'));
        fireEvent.press(getByText('Privacy Policy'));
        fireEvent.press(getByText('Terms of Service'));
        fireEvent.press(getByText('Account & Data'));

        expect(mockPush).toHaveBeenNthCalledWith(1, '/help/faq');
        expect(mockPush).toHaveBeenNthCalledWith(2, '/help/contact');
        expect(openUrlSpy).toHaveBeenNthCalledWith(1, 'https://zzocojoa.github.io/FoodLens/docs/privacy-policy/');
        expect(openUrlSpy).toHaveBeenNthCalledWith(2, 'https://zzocojoa.github.io/FoodLens/docs/terms-of-service/');
        expect(mockPush).toHaveBeenNthCalledWith(3, '/account-data');

        openUrlSpy.mockRestore();
    });

    it('goes back from the header in the normal route flow', () => {
        const { getByText } = render(<SupportPoliciesScreen />);

        fireEvent.press(getByText('Back'));

        expect(mockBack).toHaveBeenCalledTimes(1);
        expect(mockReplace).not.toHaveBeenCalled();
    });

    it('replaces back to the profile sheet route when opened from the profile sheet', () => {
        mockLocalSearchParams = { fromProfileSheet: '1' };
        const { getByText } = render(<SupportPoliciesScreen />);

        fireEvent.press(getByText('Back'));

        expect(mockBack).not.toHaveBeenCalled();
        expect(mockReplace).toHaveBeenCalledTimes(1);
        expect(mockReplace).toHaveBeenCalledWith({
            pathname: '/(tabs)',
            params: { openProfile: '1' },
        });
    });
});
