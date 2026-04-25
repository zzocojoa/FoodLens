import { buildTravelerMessage } from '../utils';

jest.mock('@/services/travelerCardLanguage', () => ({
  mapAiLanguageToTravelerCode: jest.fn(),
}));

describe('travelerAllergyCard utils', () => {
  it('uses canonical default labels and hides custom prefixes in traveler messages', () => {
    const message = buildTravelerMessage(
      'I have food allergies. Please check ingredients carefully.',
      false,
      'US',
      ['peanut', 'gluten_free', 'custom:no raw onion']
    );

    expect(message).toBe(
      'I have food allergies. Please check ingredients carefully.\n\n⚠️ My Allergies:\nPeanut, Gluten Free, no raw onion'
    );
  });
});
