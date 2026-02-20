import React from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LOGIN_COPY } from '../constants/login.constants';
import { loginStyles } from '../styles/loginStyles';

type LoginWelcomeScreenProps = {
  isActive: boolean;
  screenStyle: object;
  titleStyle: object;
  descriptionStyle: object;
  continueStyle: object;
  onContinue: () => void;
};

export default function LoginWelcomeScreen({
  isActive,
  screenStyle,
  titleStyle,
  descriptionStyle,
  continueStyle,
  onContinue,
}: LoginWelcomeScreenProps) {
  return (
    <Animated.View style={[loginStyles.screen, screenStyle]} pointerEvents={isActive ? 'auto' : 'none'}>
      <Animated.Text style={[loginStyles.welcomeTitle, titleStyle]}>{LOGIN_COPY.welcomeTitle}</Animated.Text>
      <Animated.Text style={[loginStyles.welcomeDescription, descriptionStyle]}>
        {LOGIN_COPY.welcomeDescriptionLine1}
        {'\n'}
        {LOGIN_COPY.welcomeDescriptionLine2}
      </Animated.Text>

      <Animated.View style={[loginStyles.continueButtonContainer, continueStyle]}>
        <Pressable
          testID="login-continue-button"
          onPress={onContinue}
          style={loginStyles.continueButtonPressable}
        >
          <Text style={loginStyles.continueText}>{LOGIN_COPY.continueLabel}</Text>
          <Animated.View style={loginStyles.arrowCircle}>
            <Feather name="arrow-right" size={22} color="#ffffff" />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
