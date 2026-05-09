import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Colors } from '@/constants/theme';
import PassportCardStep from '../PassportCardStep';
import type { Translate } from '../../../types/onboarding.types';
import { DEFAULT_ONBOARDING_DESTINATION } from '../../../constants/safetyPassport.constants';

jest.mock('@/services/travelerCardLanguage', () => ({
  mapAiLanguageToTravelerCode: (value: string | null | undefined) => value ?? null,
}));

const translate: Translate = (_key, fallback) => fallback ?? _key;

describe('PassportCardStep', () => {
  it('renders the selected destination language and translated allergy preview', () => {
    const onPrimary = jest.fn();
    const onEdit = jest.fn();

    const { getByLabelText, getByText } = render(
      <PassportCardStep
        theme={Colors.light}
        t={translate}
        selectedAllergies={['peanut']}
        severityMap={{ peanut: 'severe' }}
        destination={DEFAULT_ONBOARDING_DESTINATION}
        onPrimary={onPrimary}
        onEdit={onEdit}
      />
    );

    expect(getByText('Traveler allergy card')).toBeTruthy();
    expect(getByText('Japanese')).toBeTruthy();
    expect(getByText('ピーナッツ')).toBeTruthy();
    expect(getByText('私は食物アレルギーがあります。アレルギー食材が入っていないか確認してください。')).toBeTruthy();

    fireEvent.press(getByLabelText('Prepare first scan'));
    fireEvent.press(getByLabelText('Edit card inputs'));

    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('keeps a usable empty state when the user has not selected allergens yet', () => {
    const { getByText } = render(
      <PassportCardStep
        theme={Colors.light}
        t={translate}
        selectedAllergies={[]}
        severityMap={{}}
        destination={DEFAULT_ONBOARDING_DESTINATION}
        onPrimary={() => undefined}
        onEdit={() => undefined}
      />
    );

    expect(getByText('No saved allergens yet. You can add them later from the allergy card.')).toBeTruthy();
  });
});
