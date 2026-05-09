import React from 'react';
import { render } from '@testing-library/react-native';
import CompleteStep from '../CompleteStep';
import { Colors } from '@/constants/theme';
import type { Translate } from '../../../types/onboarding.types';
import { DEFAULT_ONBOARDING_DESTINATION } from '../../../constants/safetyPassport.constants';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }),
}));

const translate: Translate = (key, fallback) => {
  if (key === 'ingredients.peach') return '복숭아';
  return fallback ?? key;
};

describe('CompleteStep', () => {
  it('renders canonical and custom allergy labels without storage tokens', () => {
    const { getByText, queryByText } = render(
      <CompleteStep
        theme={Colors.light}
        t={translate}
        selectedAllergies={['peach', 'custom:no raw onion']}
        severityMap={{
          peach: 'moderate',
          'custom:no raw onion': 'severe',
        }}
        destination={DEFAULT_ONBOARDING_DESTINATION}
        permissionStatusMap={{
          camera: 'granted',
          library: 'granted',
          location: 'not_requested',
        }}
        scanEntryTarget="camera"
        loading={false}
        onScan={() => undefined}
        onCard={() => undefined}
        onHome={() => undefined}
      />
    );

    expect(getByText(/복숭아/)).toBeTruthy();
    expect(getByText(/no raw onion/)).toBeTruthy();
    expect(queryByText('peach')).toBeNull();
    expect(queryByText('custom:no raw onion')).toBeNull();
  });

  it('uses the gallery first-scan label when photo library was selected', () => {
    const { getByText } = render(
      <CompleteStep
        theme={Colors.light}
        t={translate}
        selectedAllergies={[]}
        severityMap={{}}
        destination={DEFAULT_ONBOARDING_DESTINATION}
        permissionStatusMap={{
          camera: 'not_requested',
          library: 'granted',
          location: 'not_requested',
        }}
        scanEntryTarget="gallery"
        loading={false}
        onScan={() => undefined}
        onCard={() => undefined}
        onHome={() => undefined}
      />
    );

    expect(getByText('Choose from photos')).toBeTruthy();
  });
});
