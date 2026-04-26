import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LOGIN_ANIMATION, LOGIN_LAYOUT } from '../constants/login.constants';
import { LoginAuthMode } from '../types/login.types';

const toPhoneStateValue = (mode: LoginAuthMode): number => (mode === 'signup' ? 2 : 1);
export const shouldUseLoginNativeDriver = (platform: string): boolean => platform !== 'web';

export const useLoginMotion = () => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const useNativeDriver = shouldUseLoginNativeDriver(Platform.OS);

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

  const layoutMetrics = useMemo(() => {
    const layoutHeight =
      Platform.OS === 'web' &&
      width > LOGIN_LAYOUT.phoneMaxWidth + 32 &&
      height > LOGIN_LAYOUT.phoneMaxHeight + 24
        ? LOGIN_LAYOUT.phoneMaxHeight
        : height;
    const usableHeight = Math.max(
      1,
      layoutHeight - Math.max(0, insets.top) - Math.max(0, insets.bottom),
    );
    const heightScale = Math.max(
      0.7,
      Math.min(1, usableHeight / LOGIN_LAYOUT.phoneMaxHeight),
    );

    const estimatedFooterHeight = LOGIN_LAYOUT.authFooterReservedHeight;
    const estimatedAuthFormHeightLogin = 330;
    const estimatedAuthFormHeightSignup = 350;

    const scaledLoginTop = Math.round(LOGIN_LAYOUT.authMarginTopLogin * heightScale);
    const scaledSignupTop = Math.round(LOGIN_LAYOUT.authMarginTopSignup * heightScale);
    const maxLoginTop = Math.max(
      20,
      usableHeight - estimatedAuthFormHeightLogin - estimatedFooterHeight,
    );
    const maxSignupTop = Math.max(
      20,
      usableHeight - estimatedAuthFormHeightSignup - estimatedFooterHeight,
    );

    const authMarginTopLogin = Math.max(160, Math.min(scaledLoginTop, maxLoginTop));
    const authMarginTopSignup = Math.max(124, Math.min(scaledSignupTop, maxSignupTop));
    const welcomeTitleMarginTop = Math.round(
      Math.max(292, Math.min(LOGIN_LAYOUT.welcomeTitleMarginTop * heightScale, 432)),
    );

    const footerBottom = Math.max(LOGIN_LAYOUT.footerBottomOffset, insets.bottom + 16);

    return {
      authMarginTopLogin,
      authMarginTopSignup,
      welcomeTitleMarginTop,
      footerBottom,
    };
  }, [height, insets.bottom, insets.top, width]);

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
        useNativeDriver,
      }),
      Animated.timing(welcomeTitleProgress, {
        toValue: 1,
        duration: LOGIN_ANIMATION.welcomeDurationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }),
      Animated.timing(welcomeDescriptionProgress, {
        toValue: 1,
        duration: LOGIN_ANIMATION.welcomeDurationMs,
        delay: 100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }),
      Animated.timing(welcomeContinueProgress, {
        toValue: 1,
        duration: LOGIN_ANIMATION.welcomeDurationMs,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }),
    ]).start();
  }, [
    useNativeDriver,
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
          useNativeDriver,
        }),
        Animated.timing(authFooterProgress, {
          toValue: 1,
          duration: LOGIN_ANIMATION.footerFadeInMs,
          delay: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver,
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
      useNativeDriver,
      welcomeScreenOpacity,
    ],
  );

  const goBackToWelcome = useCallback(() => {
    clearEntranceTimer();
    authInteractiveRef.current = false;
    setAuthInteractive(false);
    setWelcomeInteractive(true);
    phoneStateProgress.stopAnimation();
    phoneStateProgress.setValue(0);
    signupProgress.stopAnimation();
    signupProgress.setValue(0);
    authScreenOpacity.stopAnimation();
    authScreenOpacity.setValue(0);
    authFooterProgress.stopAnimation();
    authFooterProgress.setValue(0);
    welcomeScreenOpacity.stopAnimation();
    welcomeScreenOpacity.setValue(1);
    welcomeTitleProgress.stopAnimation();
    welcomeTitleProgress.setValue(1);
    welcomeDescriptionProgress.stopAnimation();
    welcomeDescriptionProgress.setValue(1);
    welcomeContinueProgress.stopAnimation();
    welcomeContinueProgress.setValue(1);
  }, [
    authFooterProgress,
    authScreenOpacity,
    clearEntranceTimer,
    phoneStateProgress,
    signupProgress,
    welcomeContinueProgress,
    welcomeDescriptionProgress,
    welcomeScreenOpacity,
    welcomeTitleProgress,
  ]);

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
    const createCollapsibleFieldStyle = (progress: Animated.Value) => ({
      maxHeight: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }),
      opacity: progress,
      marginBottom: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }),
      paddingBottom: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
      borderBottomWidth: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1.5] }),
    });

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
        layoutMetrics.authMarginTopLogin,
        layoutMetrics.authMarginTopLogin,
        layoutMetrics.authMarginTopSignup,
      ],
    });

    const welcomeTitleStyle = {
      marginTop: layoutMetrics.welcomeTitleMarginTop,
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
      bottom: layoutMetrics.footerBottom,
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

    const authFooterStyle =
      Platform.OS === 'android'
        ? {
            opacity: authFooterProgress,
          }
        : {
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

    const signupFieldStyle = createCollapsibleFieldStyle(signupProgress);

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
      authContainerStyle: {
        marginTop: authContainerMarginTop,
        paddingBottom: 16,
      },
      authFooterStyle,
      signupFieldStyle,
      loginActionRowStyle,
    };
  }, [
    authFooterProgress,
    authScreenOpacity,
    layoutMetrics.authMarginTopLogin,
    layoutMetrics.authMarginTopSignup,
    layoutMetrics.footerBottom,
    layoutMetrics.welcomeTitleMarginTop,
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
    goBackToWelcome,
    setAuthMode,
  };
};
