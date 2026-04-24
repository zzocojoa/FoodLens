import React from 'react';
import { Animated as RNAnimated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { ColorSchemeName } from '@/constants/theme';
import {
    homeDashboardColors,
    homeDashboardRadii,
} from '@/features/home/components/homeDashboardTokens';
import { useI18n } from '@/features/i18n';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_OPTIONS: ThemePreference[] = ['light', 'dark', 'system'];

type AnimatedThemeToggleProps = {
    colorScheme: ColorSchemeName;
    themePreference: ThemePreference;
    onChangeThemePreference: (theme: ThemePreference) => void;
};

function AnimatedThemeToggle({
    colorScheme,
    themePreference,
    onChangeThemePreference,
}: AnimatedThemeToggleProps): React.JSX.Element {
    const { t } = useI18n();
    const [containerWidth, setContainerWidth] = React.useState<number>(0);
    const translateX = React.useRef<RNAnimated.Value>(new RNAnimated.Value(0)).current;
    const activeIndex = THEME_OPTIONS.indexOf(themePreference);
    const isDarkTheme = colorScheme === 'dark';
    const segmentWidth = containerWidth > 0 ? (containerWidth - 6) / THEME_OPTIONS.length : 0;
    const optionLabels: Record<ThemePreference, string> = {
        light: t('profileHub.theme.light', 'Light'),
        dark: t('profileHub.theme.dark', 'Dark'),
        system: t('profileHub.theme.system', 'System'),
    };

    React.useEffect(() => {
        if (segmentWidth <= 0 || activeIndex < 0) {
            return;
        }

        RNAnimated.spring(translateX, {
            toValue: activeIndex * segmentWidth,
            useNativeDriver: true,
            friction: 8,
            tension: 70,
        }).start();
    }, [activeIndex, segmentWidth, translateX]);

    return (
        <View
            onLayout={(event) => {
                setContainerWidth(event.nativeEvent.layout.width);
            }}
            style={[styles.container, isDarkTheme ? styles.containerDark : styles.containerLight]}
        >
            {segmentWidth > 0 ? (
                <RNAnimated.View
                    style={[
                        styles.activeDeck,
                        isDarkTheme ? styles.activeDeckDark : styles.activeDeckLight,
                        {
                            width: segmentWidth,
                            transform: [{ translateX }],
                        },
                    ]}
                />
            ) : null}

            <View style={styles.segmentRow}>
                {THEME_OPTIONS.map((value) => {
                    const isActive = themePreference === value;

                    return (
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityState={{ selected: isActive }}
                            activeOpacity={0.9}
                            key={value}
                            onPress={() => onChangeThemePreference(value)}
                            style={styles.segmentButton}
                        >
                            <Text
                                style={[
                                    styles.segmentLabel,
                                    isDarkTheme ? styles.segmentLabelDark : styles.segmentLabelLight,
                                    isActive
                                        ? isDarkTheme
                                            ? styles.segmentLabelDarkActive
                                            : styles.segmentLabelLightActive
                                        : null,
                                ]}
                            >
                                {optionLabels[value]}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const MemoizedAnimatedThemeToggle = React.memo(AnimatedThemeToggle);

MemoizedAnimatedThemeToggle.displayName = 'AnimatedThemeToggle';

export default MemoizedAnimatedThemeToggle;

const styles = StyleSheet.create({
    container: {
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 1,
        minHeight: 42,
        overflow: 'hidden',
        padding: 3,
        position: 'relative',
    },
    containerLight: {
        backgroundColor: 'rgba(255, 251, 246, 0.92)',
        borderColor: homeDashboardColors.line,
    },
    containerDark: {
        backgroundColor: 'rgba(12, 18, 30, 0.92)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    activeDeck: {
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 1,
        bottom: 3,
        boxShadow: '0 8px 18px rgba(12, 18, 30, 0.18)',
        left: 3,
        position: 'absolute',
        top: 3,
    },
    activeDeckLight: {
        backgroundColor: homeDashboardColors.accentBlue,
        borderColor: 'rgba(255, 255, 255, 0.18)',
    },
    activeDeckDark: {
        backgroundColor: homeDashboardColors.pearlIvory,
        borderColor: 'rgba(255, 255, 255, 0.16)',
    },
    segmentRow: {
        flex: 1,
        flexDirection: 'row',
    },
    segmentButton: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
        minHeight: 36,
    },
    segmentLabel: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: -0.2,
        lineHeight: 16,
    },
    segmentLabelLight: {
        color: homeDashboardColors.inkSoft,
    },
    segmentLabelDark: {
        color: 'rgba(255, 255, 255, 0.72)',
    },
    segmentLabelLightActive: {
        color: homeDashboardColors.white,
    },
    segmentLabelDarkActive: {
        color: homeDashboardColors.accentBlue,
    },
});
