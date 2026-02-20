import React from 'react';
import { Animated } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';
import { loginStyles } from '../styles/loginStyles';

type LoginPinkHeaderProps = {
  animatedStyle: object;
};

export default function LoginPinkHeader({ animatedStyle }: LoginPinkHeaderProps) {
  return (
    <Animated.View style={[loginStyles.pinkHeader, animatedStyle]}>
      <Svg width="100%" height="100%" viewBox="0 0 375 500" style={loginStyles.patternOverlay}>
        <Circle cx="50" cy="50" r="50" stroke="#ffffff" strokeWidth={2} fill="none" opacity={0.35} />
        <Circle cx="50" cy="50" r="100" stroke="#ffffff" strokeWidth={2} fill="none" opacity={0.3} />
        <Circle cx="50" cy="50" r="150" stroke="#ffffff" strokeWidth={2} fill="none" opacity={0.25} />
        <Circle cx="250" cy="300" r="80" stroke="#ffffff" strokeWidth={2} fill="none" opacity={0.3} />
        <Circle cx="250" cy="300" r="130" stroke="#ffffff" strokeWidth={2} fill="none" opacity={0.25} />
        <Circle cx="250" cy="300" r="180" stroke="#ffffff" strokeWidth={2} fill="none" opacity={0.22} />
        <Circle cx="250" cy="300" r="230" stroke="#ffffff" strokeWidth={2} fill="none" opacity={0.18} />
      </Svg>

      <Animated.View style={loginStyles.waveBottom}>
        <Svg width="100%" height="100%" viewBox="0 0 375 150" preserveAspectRatio="none">
          <Path d="M0,100 C125,20 275,160 375,80 L375,150 L0,150 Z" fill="#ffffff" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}
