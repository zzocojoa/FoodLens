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

  it('uses ingredient i18n resources for traveler card allergen labels missing from the static term map', () => {
    const message = buildTravelerMessage(
      '저는 식품 알레르기가 있습니다. 이 음식에 알레르기 유발 성분이 없는지 확인 부탁드립니다.',
      false,
      ' kr ',
      ['peanut', 'Venison', 'Pignoli']
    );

    expect(message).toBe(
      '저는 식품 알레르기가 있습니다. 이 음식에 알레르기 유발 성분이 없는지 확인 부탁드립니다.\n\n⚠️ My Allergies:\n땅콩, 사슴고기, 잣'
    );
    expect(message).not.toContain('Venison');
    expect(message).not.toContain('Pignoli');
  });

  it('translates profile common allergen ids in traveler card messages', () => {
    const koreanMessage = buildTravelerMessage(
      '저는 식품 알레르기가 있습니다. 이 음식에 알레르기 유발 성분이 없는지 확인 부탁드립니다.',
      false,
      'KR',
      ['treenut']
    );
    const englishMessage = buildTravelerMessage(
      'I have food allergies. Please check ingredients carefully.',
      false,
      'US',
      ['treenut']
    );

    expect(koreanMessage).toBe(
      '저는 식품 알레르기가 있습니다. 이 음식에 알레르기 유발 성분이 없는지 확인 부탁드립니다.\n\n⚠️ My Allergies:\n견과류'
    );
    expect(englishMessage).toBe(
      'I have food allergies. Please check ingredients carefully.\n\n⚠️ My Allergies:\nTree Nuts'
    );
    expect(koreanMessage).not.toContain('treenut');
    expect(englishMessage).not.toContain('treenut');
  });
});
