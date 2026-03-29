import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../ProfileScreen';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockGetLatestDeletionRequest = jest.fn();
const mockCreateDeletionRequest = jest.fn();
const mockClearLocalDeletionFootprint = jest.fn();
const mockConsumeDeletionRequestFinalization = jest.fn();
const mockSaveProfile = jest.fn();
const submittedQueueIds = new Set<string>();

jest.mock('expo-router', () => ({
    useRouter: () => ({
        replace: mockReplace,
        back: mockBack,
    }),
    useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
    return {
        SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
        useSafeAreaInsets: () => ({ bottom: 0 }),
    };
});

jest.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
}));

jest.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        colorScheme: 'light',
    }),
}));

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        locale: 'en-US',
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

jest.mock('@/services/auth/authApi', () => {
    class MockAuthApiError extends Error {
        code: string;
        status: number;
        requestId?: string;

        constructor(message: string, code: string, status: number, requestId?: string) {
            super(message);
            this.name = 'AuthApiError';
            this.code = code;
            this.status = status;
            this.requestId = requestId;
        }
    }

    return {
        AuthApiError: MockAuthApiError,
    };
});

jest.mock('@/services/auth/deletionService', () => ({
    getLatestDeletionRequest: (...args: unknown[]) => mockGetLatestDeletionRequest(...args),
    createDeletionRequest: (...args: unknown[]) => mockCreateDeletionRequest(...args),
    clearLocalDeletionFootprint: (...args: unknown[]) => mockClearLocalDeletionFootprint(...args),
    consumeDeletionRequestFinalization: (...args: unknown[]) => mockConsumeDeletionRequestFinalization(...args),
}));

jest.mock('../../constants/profile.constants', () => ({
    COMMON_ALLERGENS: [],
    SEVERITY_LEVELS: [
        { key: 'mild', label: 'Mild', color: '#22C55E', emoji: '🙂' },
        { key: 'moderate', label: 'Moderate', color: '#F59E0B', emoji: '⚠️' },
        { key: 'severe', label: 'Severe', color: '#EF4444', emoji: '🚨' },
    ],
}));

jest.mock('../../components/AllergenGrid', () => {
    return function MockAllergenGrid() {
        return null;
    };
});

jest.mock('../../components/ProfileHeader', () => {
    const mockReactNative = jest.requireActual('react-native');
    const MockText = mockReactNative.Text;

    return function MockProfileHeader() {
        return <MockText>PROFILE_HEADER</MockText>;
    };
});

jest.mock('../../components/RestrictionInput', () => {
    return function MockRestrictionInput() {
        return null;
    };
});

jest.mock('../../components/SaveProfileFooter', () => {
    const mockReactNative = jest.requireActual('react-native');
    const MockTouchableOpacity = mockReactNative.TouchableOpacity;
    const MockText = mockReactNative.Text;

    return function MockSaveProfileFooter(props: { onSave: () => void }) {
        return (
            <MockTouchableOpacity onPress={props.onSave}>
                <MockText>SAVE_PROFILE</MockText>
            </MockTouchableOpacity>
        );
    };
});

jest.mock('../../hooks/useProfileScreen', () => ({
    useProfileScreen: () => ({
        loading: false,
        customAllergenInputValue: '',
        allergies: [],
        severityMap: {},
        customAllergenSuggestions: [],
        scrollViewRef: { current: null },
        toggleAllergen: jest.fn(),
        cycleSeverity: jest.fn(),
        handleCustomAllergenInputChange: jest.fn(),
        addCustomAllergen: jest.fn(),
        saveProfile: mockSaveProfile,
    }),
}));

describe('ProfileScreen deletion requests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        submittedQueueIds.clear();
        mockGetLatestDeletionRequest.mockResolvedValue(null);
        mockCreateDeletionRequest.mockImplementation(async (target: 'account' | 'data') => {
            const nextDeletionRequest = {
                queueId: 'queue-1',
                target,
                status: 'pending',
                createdAt: '2026-03-29T00:00:00Z',
                updatedAt: '2026-03-29T00:00:00Z',
                reason: 'user_requested',
                error: null,
            };
            submittedQueueIds.add(nextDeletionRequest.queueId);
            return nextDeletionRequest;
        });
        mockClearLocalDeletionFootprint.mockResolvedValue(undefined);
        mockConsumeDeletionRequestFinalization.mockImplementation((deletionRequest) => {
            if (!deletionRequest || deletionRequest.status !== 'done') {
                return false;
            }

            if (!submittedQueueIds.has(deletionRequest.queueId)) {
                return false;
            }

            submittedQueueIds.delete(deletionRequest.queueId);
            return true;
        });
    });

    it('submits a data deletion request after confirmation and renders latest status', async () => {
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
            const confirmButton = buttons?.find((button) => button.text === 'Delete Data');
            confirmButton?.onPress?.();
        });

        const { getByText } = render(<ProfileScreen />);

        await waitFor(() => {
            expect(mockGetLatestDeletionRequest).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            fireEvent.press(getByText('Delete My Data'));
        });

        await waitFor(() => {
            expect(mockCreateDeletionRequest).toHaveBeenCalledWith('data');
        });

        expect(mockClearLocalDeletionFootprint).not.toHaveBeenCalled();

        alertSpy.mockRestore();
    });

    it('clears the session and routes to login after account deletion is completed', async () => {
        mockCreateDeletionRequest.mockResolvedValue({
            queueId: 'queue-account-1',
            target: 'account',
            status: 'done',
            createdAt: '2026-03-29T00:00:00Z',
            updatedAt: '2026-03-29T00:00:02Z',
            reason: 'user_requested',
            error: null,
        });
        submittedQueueIds.add('queue-account-1');

        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
            const destructiveButton = buttons?.find((button) => button.text === 'Delete Account');
            if (destructiveButton) {
                destructiveButton.onPress?.();
                return;
            }

            const continueButton = buttons?.find((button) => button.text === 'Continue');
            continueButton?.onPress?.();
        });

        const { getByText } = render(<ProfileScreen />);

        await act(async () => {
            fireEvent.press(getByText('Delete Account'));
        });

        await waitFor(() => {
            expect(mockCreateDeletionRequest).toHaveBeenCalledWith('account');
        });

        await waitFor(() => {
            expect(mockClearLocalDeletionFootprint).toHaveBeenCalledTimes(1);
            expect(mockReplace).toHaveBeenCalledWith('/login');
        });

        alertSpy.mockRestore();
    });

    it('renders an existing failed deletion request returned by the server', async () => {
        mockGetLatestDeletionRequest.mockResolvedValue({
            queueId: 'queue-failed-1',
            target: 'data',
            status: 'failed',
            createdAt: '2026-03-29T00:00:00Z',
            updatedAt: '2026-03-29T00:10:00Z',
            reason: 'user_requested',
            error: 'Deletion queue failed.',
        });

        const { findByText } = render(<ProfileScreen />);

        expect(await findByText('Failed')).toBeTruthy();
        expect(await findByText('Deletion queue failed.')).toBeTruthy();
    });

    it('does not clear the device when an older completed deletion request is loaded on mount', async () => {
        mockGetLatestDeletionRequest.mockResolvedValue({
            queueId: 'queue-done-1',
            target: 'data',
            status: 'done',
            createdAt: '2026-03-29T00:00:00Z',
            updatedAt: '2026-03-29T00:10:00Z',
            reason: 'user_requested',
            error: null,
        });

        const { findByText } = render(<ProfileScreen />);

        expect(await findByText('Completed')).toBeTruthy();
        expect(mockConsumeDeletionRequestFinalization).toHaveBeenCalledWith({
            queueId: 'queue-done-1',
            target: 'data',
            status: 'done',
            createdAt: '2026-03-29T00:00:00Z',
            updatedAt: '2026-03-29T00:10:00Z',
            reason: 'user_requested',
            error: null,
        });
        expect(mockClearLocalDeletionFootprint).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
    });
});
