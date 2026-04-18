import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import Index from '../index';
import { restoreSession } from '../../services/auth/sessionManager';
import { hasCompletedOnboarding } from '../../services/onboardingGateService';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock('../../services/auth/sessionManager', () => ({
  restoreSession: jest.fn(),
}));

jest.mock('../../services/onboardingGateService', () => ({
  hasCompletedOnboarding: jest.fn(),
}));

const mockedRestoreSession = restoreSession as jest.MockedFunction<typeof restoreSession>;
const mockedHasCompletedOnboarding = hasCompletedOnboarding as jest.MockedFunction<
  typeof hasCompletedOnboarding
>;

describe('app/index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes unauthenticated users to login', async () => {
    mockedRestoreSession.mockResolvedValue(null);

    render(<Index />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
    expect(mockedHasCompletedOnboarding).not.toHaveBeenCalled();
  });

  it('routes authenticated users with completed onboarding to tabs', async () => {
    mockedRestoreSession.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      issuedAt: Date.now(),
      user: {
        id: 'usr_123',
        email: 'foodlens@example.com',
      },
    });
    mockedHasCompletedOnboarding.mockResolvedValue(true);

    render(<Index />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
    expect(mockedHasCompletedOnboarding).toHaveBeenCalledWith('usr_123');
  });

  it('routes authenticated users without onboarding to onboarding', async () => {
    mockedRestoreSession.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      issuedAt: Date.now(),
      user: {
        id: 'usr_456',
        email: 'foodlens@example.com',
      },
    });
    mockedHasCompletedOnboarding.mockResolvedValue(false);

    render(<Index />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
    });
    expect(mockedHasCompletedOnboarding).toHaveBeenCalledWith('usr_456');
  });
});
