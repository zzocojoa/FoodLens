import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Colors } from '@/constants/theme';
import DestinationStep from '../DestinationStep';
import type { PermissionStatusMap, Translate } from '../../../types/onboarding.types';
import {
  DEFAULT_ONBOARDING_DESTINATION,
  ONBOARDING_DESTINATIONS,
} from '../../../constants/safetyPassport.constants';

const translate: Translate = (_key, fallback) => fallback ?? _key;

const permissionStatusMap: PermissionStatusMap = {
  camera: 'not_requested',
  library: 'not_requested',
  location: 'not_requested',
};

describe('DestinationStep', () => {
  it('keeps location permission action-triggered and supports manual destination selection', () => {
    const onSelectDestination = jest.fn();
    const onDetectLocation = jest.fn();
    const onNext = jest.fn();

    const { getByLabelText, getByText } = render(
      <DestinationStep
        theme={Colors.light}
        t={translate}
        destination={DEFAULT_ONBOARDING_DESTINATION}
        destinations={ONBOARDING_DESTINATIONS}
        permissionStatusMap={permissionStatusMap}
        locationDetecting={false}
        onSelectDestination={onSelectDestination}
        onDetectLocation={onDetectLocation}
        onNext={onNext}
      />
    );

    expect(getByText('Japan')).toBeTruthy();
    expect(getByText('Thailand')).toBeTruthy();
    expect(getByText('France')).toBeTruthy();
    expect(getByText('United States')).toBeTruthy();
    expect(onDetectLocation).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Detect current country'));

    expect(onDetectLocation).toHaveBeenCalledTimes(1);

    fireEvent.press(getByLabelText('Thailand'));

    expect(onSelectDestination).toHaveBeenCalledWith(ONBOARDING_DESTINATIONS[1]);

    fireEvent.press(getByLabelText('Preview card'));

    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
