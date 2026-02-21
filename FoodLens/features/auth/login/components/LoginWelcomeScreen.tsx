import React from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LoginCopy } from '../constants/login.constants';
import { loginStyles } from '../styles/loginStyles';

type LoginWelcomeScreenProps = {
  isActive: boolean;
  copy: LoginCopy;
  screenStyle: object;
  titleStyle: object;
  descriptionStyle: object;
  continueStyle: object;
  onContinue: () => void;
};

export default function LoginWelcomeScreen({
  isActive,
  copy,
  screenStyle,
  titleStyle,
  descriptionStyle,
  continueStyle,
  onContinue,
}: LoginWelcomeScreenProps) {
  return (
    <Animated.View style={[loginStyles.screen, screenStyle]} pointerEvents={isActive ? 'auto' : 'none'}>
      <Animated.Text style={[loginStyles.welcomeTitle, titleStyle]}>{copy.welcomeTitle}</Animated.Text>
      <Animated.Text style={[loginStyles.welcomeDescription, descriptionStyle]}>
        {copy.welcomeDescriptionLine1}
        {'\n'}
        {copy.welcomeDescriptionLine2}
      </Animated.Text>

      <Animated.View style={[loginStyles.continueButtonContainer, continueStyle]}>
        <Pressable
          testID="login-continue-button"
          onPress={onContinue}
          style={loginStyles.continueButtonPressable}
        >
          <Text style={loginStyles.continueText}>{copy.continueLabel}</Text>
          <Animated.View style={loginStyles.arrowCircle}>
            <Feather name="arrow-right" size={22} color="#ffffff" />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
