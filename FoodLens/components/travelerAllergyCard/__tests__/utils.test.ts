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
      ['peanut', 'gluten_free', 'vegan', 'custom:no raw onion']
    );

    expect(message).toBe(
      'I have food allergies. Please check ingredients carefully.\n\n⚠️ My Allergies:\nPeanut, Gluten Free, Vegan, no raw onion'
    );
    expect(message).not.toContain('custom:');
    expect(message).not.toContain('gluten_free');
  });
});
