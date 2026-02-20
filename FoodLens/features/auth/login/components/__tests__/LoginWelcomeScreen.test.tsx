/// <reference types="jest" />

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LoginWelcomeScreen from '../LoginWelcomeScreen';
import { loginStyles } from '../../styles/loginStyles';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    Feather: ({ name }: { name: string }) =>
      ReactModule.createElement(Text, null, `icon-${name}`),
  };
});

const createProps = (overrides?: Partial<React.ComponentProps<typeof LoginWelcomeScreen>>) => ({
  isActive: true,
  screenStyle: {},
  titleStyle: {},
  descriptionStyle: {},
  continueStyle: {},
  onContinue: jest.fn(),
  ...overrides,
});

describe('LoginWelcomeScreen', () => {
  it('matches snapshot', () => {
    const { toJSON } = render(<LoginWelcomeScreen {...createProps()} />);

    expect(toJSON()).toMatchSnapshot();
  });

  it('calls continue handler when pressing continue button', () => {
    const onContinue = jest.fn();
    const { getByTestId } = render(
      <LoginWelcomeScreen {...createProps({ onContinue })} />,
    );

    fireEvent.press(getByTestId('login-continue-button'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('uses dedicated pressable style instead of the absolute container style', () => {
    const { getByTestId } = render(<LoginWelcomeScreen {...createProps()} />);
    const continuePressable = getByTestId('login-continue-button');

    expect(continuePressable.props.style).toBe(loginStyles.continueButtonPressable);
    expect(continuePressable.props.style).not.toBe(loginStyles.continueButtonContainer);
  });
});
