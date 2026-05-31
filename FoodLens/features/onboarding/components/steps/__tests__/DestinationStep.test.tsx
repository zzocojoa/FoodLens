import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { Colors } from '@/constants/theme';
import DestinationStep from '../DestinationStep';
import type {
  DetectedOnboardingLocation,
  PermissionStatusMap,
  Translate,
} from '../../../types/onboarding.types';
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
        detectedLocation={null}
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
    expect(getByText('South Korea')).toBeTruthy();
    expect(onDetectLocation).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Detect current country'));

    expect(onDetectLocation).toHaveBeenCalledTimes(1);

    fireEvent.press(getByLabelText('Thailand'));

    expect(onSelectDestination).toHaveBeenCalledWith(ONBOARDING_DESTINATIONS[1]);

    fireEvent.press(getByLabelText('Preview card'));

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('keeps destination actions reachable inside a scroll container', () => {
    const { UNSAFE_getByType, getByLabelText } = render(
      <DestinationStep
        theme={Colors.light}
        t={translate}
        destination={DEFAULT_ONBOARDING_DESTINATION}
        destinations={ONBOARDING_DESTINATIONS}
        permissionStatusMap={permissionStatusMap}
        detectedLocation={null}
        locationDetecting={false}
        onSelectDestination={jest.fn()}
        onDetectLocation={jest.fn()}
        onNext={jest.fn()}
      />
    );

    expect(UNSAFE_getByType(ScrollView)).toBeTruthy();
    expect(getByLabelText('Preview card')).toBeTruthy();
  });

  it('shows detected unsupported countries without changing the quick destination list', () => {
    const detectedLocation: DetectedOnboardingLocation = {
      city: 'Ho Chi Minh City',
      country: 'Vietnam',
      countryCode: 'VN',
      formattedAddress: 'Ho Chi Minh City, Vietnam',
      matchedDestinationId: null,
    };

    const { getByText } = render(
      <DestinationStep
        theme={Colors.light}
        t={translate}
        destination={DEFAULT_ONBOARDING_DESTINATION}
        destinations={ONBOARDING_DESTINATIONS}
        permissionStatusMap={{
          ...permissionStatusMap,
          location: 'granted',
        }}
        detectedLocation={detectedLocation}
        locationDetecting={false}
        onSelectDestination={jest.fn()}
        onDetectLocation={jest.fn()}
        onNext={jest.fn()}
      />
    );

    expect(getByText('Ho Chi Minh City, Vietnam')).toBeTruthy();
    expect(
      getByText('This country is not in quick cards yet. Your selected card language stays unchanged.')
    ).toBeTruthy();
    expect(getByText('Japan')).toBeTruthy();
    expect(getByText('Thailand')).toBeTruthy();
    expect(getByText('France')).toBeTruthy();
    expect(getByText('United States')).toBeTruthy();
    expect(getByText('South Korea')).toBeTruthy();
  });
});
