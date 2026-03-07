import { hasCompletedOnboarding } from '../onboardingGateService';
import { Phase2Api } from '../sync/phase2Api_Logic';
import { hasSeenOnboarding, setOnboardingComplete } from '../storage_Logic';

jest.mock('../storage_Logic', () => ({
  hasSeenOnboarding: jest.fn(),
  setOnboardingComplete: jest.fn(),
}));

jest.mock('../sync/phase2Api_Logic', () => ({
  Phase2Api: {
    getProfile: jest.fn(),
    getAllergies: jest.fn(),
    getSettings: jest.fn(),
    getHistory: jest.fn(),
  },
}));

const mockedHasSeenOnboarding = hasSeenOnboarding as jest.MockedFunction<typeof hasSeenOnboarding>;
const mockedSetOnboardingComplete = setOnboardingComplete as jest.MockedFunction<typeof setOnboardingComplete>;
const mockedPhase2Api = Phase2Api as jest.Mocked<typeof Phase2Api>;

describe('onboardingGateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedHasSeenOnboarding.mockResolvedValue(false);
    mockedPhase2Api.getProfile.mockResolvedValue({
      requestId: 'req_profile',
      profile: {
        user_id: 'usr_test',
        email: 'tester@example.com',
      },
    });
    mockedPhase2Api.getAllergies.mockResolvedValue({
      requestId: 'req_allergies',
      allergies: {
        user_id: 'usr_test',
        allergies: [],
        dietary_restrictions: [],
        severity_map: {},
      },
    });
    mockedPhase2Api.getSettings.mockResolvedValue({
      requestId: 'req_settings',
      settings: {
        user_id: 'usr_test',
        language: 'auto',
        target_language: null,
        auto_play_audio: false,
        selected_emoji: null,
      },
    });
    mockedPhase2Api.getHistory.mockResolvedValue({
      requestId: 'req_history',
      history: [],
    });
  });

  it('returns true immediately when local onboarding flag exists', async () => {
    mockedHasSeenOnboarding.mockResolvedValueOnce(true);

    const result = await hasCompletedOnboarding('usr_test');
    expect(result).toBe(true);
    expect(mockedPhase2Api.getProfile).not.toHaveBeenCalled();
  });

  it('marks onboarding complete when server profile shows onboarding evidence', async () => {
    mockedPhase2Api.getProfile.mockResolvedValueOnce({
      requestId: 'req_profile',
      profile: {
        user_id: 'usr_test',
        email: 'tester@example.com',
        birth_year: 1999,
      },
    });

    const result = await hasCompletedOnboarding('usr_test');
    expect(result).toBe(true);
    expect(mockedSetOnboardingComplete).toHaveBeenCalledWith('usr_test');
  });

  it('returns false when server has no onboarding evidence', async () => {
    const result = await hasCompletedOnboarding('usr_test');
    expect(result).toBe(false);
    expect(mockedSetOnboardingComplete).not.toHaveBeenCalled();
  });
});
