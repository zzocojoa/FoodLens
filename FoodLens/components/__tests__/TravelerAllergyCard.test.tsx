import React from 'react';
import { render } from '@testing-library/react-native';
import TravelerAllergyCard from '../TravelerAllergyCard';

const mockUseTravelerAllergyCardModel = jest.fn();

jest.mock('../travelerAllergyCard/hooks/useTravelerAllergyCardModel', () => ({
  useTravelerAllergyCardModel: (...args: unknown[]) => mockUseTravelerAllergyCardModel(...args),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'travelerCard.title': '여행자 알레르기 카드',
        'travelerCard.subtitle.photoLocation': '사진 위치 기준',
        'travelerCard.language.korean': '한국어',
        'travelerCard.allergiesLabel': '⚠️ 내 알레르기:',
      };

      return translations[key] ?? fallback ?? key;
    },
  }),
}));

describe('TravelerAllergyCard', () => {
  beforeEach(() => {
    mockUseTravelerAllergyCardModel.mockReturnValue({
      displayData: {
        language: 'Korean',
        sub: 'Traveler Safety Card (Photo Location)',
      },
      finalMessage: '밀/글루텐 알레르기가 있습니다.',
      isAiLoaded: true,
    });
  });

  it('renders localized traveler card chrome for the current locale', () => {
    const { getByText, queryByText } = render(
      <TravelerAllergyCard countryCode="KR" aiTranslation={undefined} />
    );

    expect(getByText('여행자 알레르기 카드 • 한국어')).toBeTruthy();
    expect(queryByText('사진 위치 기준')).toBeNull();
    expect(queryByText('Traveler Safety Card (Photo Location)')).toBeNull();
  });

  it('replaces the english allergies prefix with the localized label', () => {
    mockUseTravelerAllergyCardModel.mockReturnValue({
      displayData: {
        language: 'Korean',
        sub: 'Traveler Safety Card (Photo Location)',
      },
      finalMessage: '알레르기 경고 문구\n\n⚠️ My Allergies:\n밀, 우유',
      isAiLoaded: false,
    });

    const { getByText, queryByText } = render(
      <TravelerAllergyCard countryCode="KR" aiTranslation={undefined} />
    );

    expect(getByText('알레르기 경고 문구\n\n⚠️ 내 알레르기:\n밀, 우유')).toBeTruthy();
    expect(queryByText('⚠️ My Allergies:')).toBeNull();
  });
});
