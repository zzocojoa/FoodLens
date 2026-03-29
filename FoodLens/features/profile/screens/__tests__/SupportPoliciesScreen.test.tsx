import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import SupportPoliciesScreen from '../SupportPoliciesScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: mockPush,
        back: mockBack,
        replace: mockReplace,
    }),
    useLocalSearchParams: () => ({}),
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
    const MockText = mockReactNative.Text;

    return function MockProfileHeader() {
        return <MockText>PROFILE_HEADER</MockText>;
    };
});

describe('SupportPoliciesScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        }) as typeof requestAnimationFrame;
    });

    it('routes to support, legal, and account destinations from the hub', () => {
        const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
        const { getAllByText, getByText } = render(<SupportPoliciesScreen />);

        fireEvent.press(getByText('Help Center'));
        fireEvent.press(getByText('Contact Support'));
        fireEvent.press(getByText('Privacy Policy'));
        fireEvent.press(getByText('Terms of Service'));
        fireEvent.press(getAllByText('Account & Data')[1]);

        expect(mockPush).toHaveBeenNthCalledWith(1, '/help/faq');
        expect(mockPush).toHaveBeenNthCalledWith(2, '/help/contact');
        expect(openUrlSpy).toHaveBeenNthCalledWith(1, 'https://zzocojoa.github.io/FoodLens/docs/privacy-policy/');
        expect(openUrlSpy).toHaveBeenNthCalledWith(2, 'https://zzocojoa.github.io/FoodLens/docs/terms-of-service/');
        expect(mockPush).toHaveBeenNthCalledWith(3, '/account-data');

        openUrlSpy.mockRestore();
    });
});
