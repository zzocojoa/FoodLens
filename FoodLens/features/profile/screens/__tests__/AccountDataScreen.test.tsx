import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AccountDataScreen from '../AccountDataScreen';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockGetLatestDeletionRequest = jest.fn();
const mockCreateDeletionRequest = jest.fn();
const mockClearLocalDeletionFootprint = jest.fn();
const mockConsumeDeletionRequestFinalization = jest.fn();
const submittedRequestIds = new Set<string>();

jest.mock('expo-router', () => ({
    useRouter: () => ({
        replace: mockReplace,
        back: mockBack,
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

jest.mock('../../components/ProfileHeader', () => {
    const mockReactNative = jest.requireActual('react-native');
    const MockText = mockReactNative.Text;

    return function MockProfileHeader() {
        return <MockText>PROFILE_HEADER</MockText>;
    };
});

describe('AccountDataScreen deletion requests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        submittedRequestIds.clear();
        mockGetLatestDeletionRequest.mockResolvedValue(null);
        mockCreateDeletionRequest.mockImplementation(async (target: 'account' | 'data') => {
            const nextDeletionRequest = {
                requestId: 'req-1',
                target,
                status: 'pending',
                requestedAt: '2026-03-29T00:00:00Z',
                completedAt: null,
                retryable: false,
                failureCode: null,
                message: null,
            };
            submittedRequestIds.add(nextDeletionRequest.requestId);
            return nextDeletionRequest;
        });
        mockClearLocalDeletionFootprint.mockResolvedValue(undefined);
        mockConsumeDeletionRequestFinalization.mockImplementation((deletionRequest) => {
            if (!deletionRequest || deletionRequest.status !== 'done') {
                return false;
            }

            if (!submittedRequestIds.has(deletionRequest.requestId)) {
                return false;
            }

            submittedRequestIds.delete(deletionRequest.requestId);
            return true;
        });
    });

    it('submits a data deletion request after confirmation and renders latest status', async () => {
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
            const confirmButton = buttons?.find((button) => button.text === 'Delete Data');
            confirmButton?.onPress?.();
        });

        const { getByText } = render(<AccountDataScreen />);

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
            requestId: 'req-account-1',
            target: 'account',
            status: 'done',
            requestedAt: '2026-03-29T00:00:00Z',
            completedAt: '2026-03-29T00:00:02Z',
            retryable: false,
            failureCode: null,
            message: null,
        });
        submittedRequestIds.add('req-account-1');

        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
            const destructiveButton = buttons?.find((button) => button.text === 'Delete Account');
            if (destructiveButton) {
                destructiveButton.onPress?.();
                return;
            }

            const continueButton = buttons?.find((button) => button.text === 'Continue');
            continueButton?.onPress?.();
        });

        const { getByText } = render(<AccountDataScreen />);

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
            requestId: 'req-failed-1',
            target: 'data',
            status: 'failed',
            requestedAt: '2026-03-29T00:00:00Z',
            completedAt: '2026-03-29T00:10:00Z',
            retryable: true,
            failureCode: 'DELETION_REQUEST_FAILED',
            message: 'Deletion request failed. Please retry or contact support with request_id.',
        });

        const { findByText } = render(<AccountDataScreen />);

        expect(await findByText('Failed')).toBeTruthy();
        expect(await findByText('Deletion request failed. Please retry or contact support with request_id.')).toBeTruthy();
        expect(await findByText('Request ID: req-failed-1')).toBeTruthy();
    });

    it('does not clear the device when an older completed deletion request is loaded on mount', async () => {
        mockGetLatestDeletionRequest.mockResolvedValue({
            requestId: 'req-done-1',
            target: 'data',
            status: 'done',
            requestedAt: '2026-03-29T00:00:00Z',
            completedAt: '2026-03-29T00:10:00Z',
            retryable: false,
            failureCode: null,
            message: null,
        });

        const { findByText } = render(<AccountDataScreen />);

        expect(await findByText('Completed')).toBeTruthy();
        expect(mockConsumeDeletionRequestFinalization).toHaveBeenCalledWith({
            requestId: 'req-done-1',
            target: 'data',
            status: 'done',
            requestedAt: '2026-03-29T00:00:00Z',
            completedAt: '2026-03-29T00:10:00Z',
            retryable: false,
            failureCode: null,
            message: null,
        });
        expect(mockClearLocalDeletionFootprint).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
    });
});
