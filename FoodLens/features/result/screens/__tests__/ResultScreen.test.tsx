import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ResultScreen from '../ResultScreen';
import { openMailtoUrl } from '@/features/support/supportMail';
import { useResultScreen } from '../../hooks/useResultScreen';
import { shareResultCard } from '../../components/resultShareTransport';

jest.mock('@/services/storage', () => ({
    SafeStorage: {
        get: jest.fn(async (_key: string, fallback: unknown) => fallback),
        set: jest.fn(async () => undefined),
        remove: jest.fn(async () => undefined),
        clearAll: jest.fn(async () => undefined),
    },
}));

jest.mock('../../hooks/useResultScreen', () => ({
    useResultScreen: jest.fn(),
}));

jest.mock('@/features/support/supportMail', () => ({
    openMailtoUrl: jest.fn(),
}));

jest.mock('../../components/resultShareTransport', () => ({
    shareResultCard: jest.fn(),
}));

jest.mock('@/hooks/use-app-navigation', () => ({
    useAppNavigation: () => ({
        back: jest.fn(),
    }),
}));

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        locale: 'en-US',
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

jest.mock('expo-router', () => ({
    Stack: {
        Screen: () => null,
    },
    useRouter: () => ({
        replace: jest.fn(),
    }),
}));

jest.mock('expo-status-bar', () => ({
    StatusBar: () => null,
}));

jest.mock('@/components/BreakdownOverlay', () => () => null);
jest.mock('@/components/DateEditSheet', () => ({
    DateEditSheet: () => null,
}));
jest.mock('@/components/result/ActionButtons', () => ({
    ActionButtons: () => null,
}));
jest.mock('@/components/result/ResultContent', () => ({
    ResultContent: () => null,
}));
jest.mock('@/components/result/ResultHeader', () => ({
    ResultHeader: () => null,
}));
jest.mock('../../components/ResultErrorState', () => () => null);
jest.mock('../../components/ResultLoadingState', () => () => null);
jest.mock('../../components/ResultShareCard', () => () => null);
jest.mock('../../components/ResultNavBar', () => ({
    __esModule: true,
    default: ({
        onReport,
        onShare,
        reportAccessibilityLabel,
        shareAccessibilityLabel,
    }: {
        onReport: () => void;
        onShare: () => void;
        reportAccessibilityLabel: string;
        shareAccessibilityLabel: string;
    }) => {
        const ReactNative = jest.requireActual('react-native');
        return (
            <>
                <ReactNative.TouchableOpacity accessibilityLabel={reportAccessibilityLabel} onPress={onReport}>
                    <ReactNative.Text>report</ReactNative.Text>
                </ReactNative.TouchableOpacity>
                <ReactNative.TouchableOpacity accessibilityLabel={shareAccessibilityLabel} onPress={onShare}>
                    <ReactNative.Text>share</ReactNative.Text>
                </ReactNative.TouchableOpacity>
            </>
        );
    },
}));

const mockUseResultScreen = useResultScreen as jest.MockedFunction<typeof useResultScreen>;
const mockOpenMailtoUrl = openMailtoUrl as jest.MockedFunction<typeof openMailtoUrl>;
const mockShareResultCard = shareResultCard as jest.MockedFunction<typeof shareResultCard>;

const buildHookState = (overrides?: Partial<ReturnType<typeof useResultScreen>>): ReturnType<typeof useResultScreen> => ({
    isRestoring: false,
    loaded: true,
    result: {
        foodName: 'Bibimbap',
        foodName_en: 'Bibimbap',
        foodName_ko: '비빔밥',
        safetyStatus: 'CAUTION',
        confidence: 88,
        request_id: 'req-123',
        prompt_version: 'food-v3.2',
        ingredients: [],
        raw_result: 'Test summary',
        raw_result_en: 'Test summary',
        raw_result_ko: '테스트 요약',
        used_model: 'gemini-2.5-pro',
        isBarcode: false,
    },
    locationData: {
        city: 'Seoul',
        country: 'South Korea',
        formattedAddress: 'Seoul, South Korea',
        isoCountryCode: 'KR',
    },
    imageSource: null,
    rawImageUri: undefined,
    displayImageUri: undefined,
    timestamp: '2026-03-29T10:15:00.000Z',
    savedRecordId: 'record-99',
    reportSaveState: 'ready',
    retryReportSave: jest.fn(),
    isDateEditOpen: false,
    setIsDateEditOpen: jest.fn(),
    handleDateUpdate: jest.fn(),
    layoutStyle: undefined,
    scrollHandler: jest.fn(),
    imageAnimatedStyle: {
        transform: [{ scale: 1 }],
        opacity: 1,
    },
    headerOverlayStyle: {
        opacity: 1,
    },
    isBreakdownOpen: false,
    openBreakdown: jest.fn(),
    closeBreakdown: jest.fn(),
    isError: false,
    errorInfo: null,
    ...overrides,
});

describe('ResultScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('blocks report while a new result is still saving', () => {
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
        mockUseResultScreen.mockReturnValue(buildHookState({
            savedRecordId: null,
            reportSaveState: 'saving',
        }));

        const { getByLabelText } = render(<ResultScreen />);
        fireEvent.press(getByLabelText('Report'));

        expect(alertSpy).toHaveBeenCalledWith(
            'Saving analysis',
            'We are still saving this result. Please try reporting again in a moment.'
        );
        expect(mockOpenMailtoUrl).not.toHaveBeenCalled();
    });

    it('retries save before reporting when autosave previously failed', () => {
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
        const retryReportSave = jest.fn();
        mockUseResultScreen.mockReturnValue(buildHookState({
            savedRecordId: null,
            reportSaveState: 'failed',
            retryReportSave,
        }));

        const { getByLabelText } = render(<ResultScreen />);
        fireEvent.press(getByLabelText('Report'));

        expect(retryReportSave).toHaveBeenCalledTimes(1);
        expect(alertSpy).toHaveBeenCalledWith(
            'Save failed',
            'We could not finish saving this result. We are trying again now. Please report again in a moment.'
        );
        expect(mockOpenMailtoUrl).not.toHaveBeenCalled();
    });

    it('opens the report mail flow once save metadata is ready', () => {
        mockUseResultScreen.mockReturnValue(buildHookState());
        mockOpenMailtoUrl.mockResolvedValue(undefined);

        const { getByLabelText } = render(<ResultScreen />);
        fireEvent.press(getByLabelText('Report'));

        expect(mockOpenMailtoUrl).toHaveBeenCalledTimes(1);
    });

    it('shares the generated result card when the share action is pressed', () => {
        mockUseResultScreen.mockReturnValue(buildHookState());
        mockShareResultCard.mockResolvedValue(undefined);

        const { getByLabelText } = render(<ResultScreen />);
        fireEvent.press(getByLabelText('Share'));

        expect(mockShareResultCard).toHaveBeenCalledTimes(1);
    });
});
