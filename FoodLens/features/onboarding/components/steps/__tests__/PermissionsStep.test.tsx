import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import PermissionsStep from '../PermissionsStep';
import { Colors } from '@/constants/theme';
import type { Translate } from '../../../types/onboarding.types';

const translate: Translate = (_key, fallback) => fallback ?? '';

describe('PermissionsStep', () => {
  it('does not request permissions until a scan action is pressed', () => {
    const onRequestCamera = jest.fn();
    const onRequestLibrary = jest.fn();
    const onSkip = jest.fn();
    const { getByText } = render(
      <PermissionsStep
        theme={Colors.light}
        t={translate}
        permissionStatusMap={{
          camera: 'not_requested',
          library: 'not_requested',
          location: 'not_requested',
        }}
        onRequestCamera={onRequestCamera}
        onRequestLibrary={onRequestLibrary}
        onSkip={onSkip}
      />
    );

    expect(onRequestCamera).not.toHaveBeenCalled();
    expect(onRequestLibrary).not.toHaveBeenCalled();

    fireEvent.press(getByText('Open camera'));
    expect(onRequestCamera).toHaveBeenCalledTimes(1);
    expect(onRequestLibrary).not.toHaveBeenCalled();

    fireEvent.press(getByText('Choose from photos'));
    expect(onRequestLibrary).toHaveBeenCalledTimes(1);
  });
});
