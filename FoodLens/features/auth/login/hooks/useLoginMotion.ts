import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { LOGIN_ANIMATION, LOGIN_LAYOUT } from '../constants/login.constants';
import { LoginAuthMode } from '../types/login.types';

const toPhoneStateValue = (mode: LoginAuthMode): number => (mode === 'signup' ? 2 : 1);

export const useLoginMotion = () => {
  const phoneStateProgress = useRef(new Animated.Value(0)).current;
  const signupProgress = useRef(new Animated.Value(0)).current;
  const welcomeScreenOpacity = useRef(new Animated.Value(0)).current;
  const welcomeTitleProgress = useRef(new Animated.Value(0)).current;
  const welcomeDescriptionProgress = useRef(new Animated.Value(0)).current;
  const welcomeContinueProgress = useRef(new Animated.Value(0)).current;
  const authScreenOpacity = useRef(new Animated.Value(0)).current;
  const authFooterProgress = useRef(new Animated.Value(0)).current;
  const authInteractiveRef = useRef(false);

  const [welcomeInteractive, setWelcomeInteractive] = useState(false);
  const [authInteractive, setAuthInteractive] = useState(false);

  const entranceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearEntranceTimer = useCallback(() => {
    if (entranceTimerRef.current) {
      clearTimeout(entranceTimerRef.current);
      entranceTimerRef.current = null;
    }
  }, []);

  const runWelcomeEntrance = useCallback(() => {
    if (authInteractiveRef.current) {
      return;
    }
    setWelcomeInteractive(true);

    Animated.parallel([
      Animated.timing(welcomeScreenOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(welcomeTitleProgress, {
        toValue: 1,
        duration: LOGIN_ANIMATION.welcomeDurationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(welcomeDescriptionProgress, {
        toValue: 1,
        duration: LOGIN_ANIMATION.welcomeDurationMs,
        delay: 100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(welcomeContinueProgress, {
        toValue: 1,
        duration: LOGIN_ANIMATION.welcomeDurationMs,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    welcomeContinueProgress,
    welcomeDescriptionProgress,
    welcomeScreenOpacity,
    welcomeTitleProgress,
  ]);

  const setAuthMode = useCallback(
    (mode: LoginAuthMode) => {
      Animated.parallel([
        Animated.timing(phoneStateProgress, {
          toValue: toPhoneStateValue(mode),
          duration: LOGIN_ANIMATION.stateTransitionMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(signupProgress, {
          toValue: mode === 'signup' ? 1 : 0,
          duration: LOGIN_ANIMATION.collapseMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    },
    [phoneStateProgress, signupProgress],
  );

  const goToAuth = useCallback(
    (mode: LoginAuthMode) => {
      clearEntranceTimer();

      if (authInteractive) {
        authInteractiveRef.current = true;
        setAuthMode(mode);
        return;
      }

      authInteractiveRef.current = true;
      setWelcomeInteractive(false);
      setAuthInteractive(true);
      welcomeScreenOpacity.stopAnimation();
      welcomeScreenOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(phoneStateProgress, {
          toValue: toPhoneStateValue(mode),
          duration: LOGIN_ANIMATION.stateTransitionMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(signupProgress, {
          toValue: mode === 'signup' ? 1 : 0,
          duration: LOGIN_ANIMATION.collapseMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(authScreenOpacity, {
          toValue: 1,
          duration: LOGIN_ANIMATION.authFadeInMs,
          delay: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(authFooterProgress, {
          toValue: 1,
          duration: LOGIN_ANIMATION.footerFadeInMs,
          delay: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    },
    [
      authFooterProgress,
      authInteractive,
      authScreenOpacity,
      clearEntranceTimer,
      phoneStateProgress,
      setAuthMode,
      signupProgress,
      welcomeScreenOpacity,
    ],
  );

  useEffect(() => {
    entranceTimerRef.current = setTimeout(() => {
      entranceTimerRef.current = null;
      runWelcomeEntrance();
    }, LOGIN_ANIMATION.welcomeDelayMs);

    return () => {
      clearEntranceTimer();
      phoneStateProgress.stopAnimation();
      signupProgress.stopAnimation();
      welcomeScreenOpacity.stopAnimation();
      welcomeTitleProgress.stopAnimation();
      welcomeDescriptionProgress.stopAnimation();
      welcomeContinueProgress.stopAnimation();
      authScreenOpacity.stopAnimation();
      authFooterProgress.stopAnimation();
    };
  }, [
    authFooterProgress,
    authScreenOpacity,
    clearEntranceTimer,
    phoneStateProgress,
    runWelcomeEntrance,
    signupProgress,
    welcomeContinueProgress,
    welcomeDescriptionProgress,
    welcomeScreenOpacity,
    welcomeTitleProgress,
  ]);

  const motion = useMemo(() => {
    const headerTranslateY = phoneStateProgress.interpolate({
      inputRange: [0, 1, 2],
      outputRange: [
        0,
        LOGIN_LAYOUT.pinkHeaderTranslateLogin,
        LOGIN_LAYOUT.pinkHeaderTranslateSignup,
      ],
    });

    const authContainerMarginTop = phoneStateProgress.interpolate({
      inputRange: [0, 1, 2],
      outputRange: [
        LOGIN_LAYOUT.authMarginTopLogin,
        LOGIN_LAYOUT.authMarginTopLogin,
        LOGIN_LAYOUT.authMarginTopSignup,
      ],
    });

    const welcomeTitleStyle = {
      opacity: welcomeTitleProgress,
      transform: [
        {
          translateX: welcomeTitleProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-50, 0],
          }),
        },
      ],
    };

    const welcomeDescriptionStyle = {
      opacity: welcomeDescriptionProgress,
      transform: [
        {
          translateX: welcomeDescriptionProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-30, 0],
          }),
        },
      ],
    };

    const welcomeContinueStyle = {
      opacity: welcomeContinueProgress,
      transform: [
        {
          translateY: welcomeContinueProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [50, 0],
          }),
        },
      ],
    };

    const authFooterStyle = {
      opacity: authFooterProgress,
      transform: [
        {
          translateY: authFooterProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        },
      ],
    };

    const signupFieldStyle = {
      maxHeight: signupProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }),
      opacity: signupProgress,
      marginBottom: signupProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }),
      paddingBottom: signupProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
      borderBottomWidth: signupProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 1.5] }),
    };

    const loginActionRowStyle = {
      maxHeight: signupProgress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
      opacity: signupProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      marginTop: signupProgress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
      marginBottom: signupProgress.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
    };

    return {
      pinkHeaderStyle: { transform: [{ translateY: headerTranslateY }] },
      welcomeScreenStyle: { opacity: welcomeScreenOpacity },
      welcomeTitleStyle,
      welcomeDescriptionStyle,
      welcomeContinueStyle,
      authScreenStyle: { opacity: authScreenOpacity },
      authContainerStyle: { marginTop: authContainerMarginTop },
      authFooterStyle,
      signupFieldStyle,
      loginActionRowStyle,
    };
  }, [
    authFooterProgress,
    authScreenOpacity,
    phoneStateProgress,
    signupProgress,
    welcomeContinueProgress,
    welcomeDescriptionProgress,
    welcomeScreenOpacity,
    welcomeTitleProgress,
  ]);

  return {
    welcomeInteractive,
    authInteractive,
    motion,
    goToAuth,
    setAuthMode,
  };
};
