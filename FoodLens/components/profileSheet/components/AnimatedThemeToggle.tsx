import React, { useEffect, useState } from 'react';
import { Text, View, Animated as RNAnimated } from 'react-native';
import { HapticPressable } from '@/components/HapticFeedback';
import { profileSheetStyles as styles } from '../styles';
import { useI18n } from '@/features/i18n';

type AnimatedThemeToggleProps = {
    theme: any;
    currentTheme: string;
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    colorScheme: string;
};

export default function AnimatedThemeToggle({
    theme,
    currentTheme,
    setTheme,
    colorScheme,
}: AnimatedThemeToggleProps) {
    const { t } = useI18n();
    const [containerWidth, setContainerWidth] = useState(0);
    const translateX = React.useRef(new RNAnimated.Value(0)).current;

    const options = ['light', 'dark', 'system'] as const;
    const activeIndex = options.indexOf(currentTheme as any);
    const optionLabels = {
        light: t('profileSheet.theme.light', 'Light'),
        dark: t('profileSheet.theme.dark', 'Dark'),
        system: t('profileSheet.theme.system', 'System'),
    };

    useEffect(() => {
        if (containerWidth > 0) {
            const tabWidth = (containerWidth - 8) / 3;
            RNAnimated.spring(translateX, {
                toValue: activeIndex * tabWidth,
                useNativeDriver: true,
                friction: 7,
                tension: 50,
            }).start();
        }
    }, [activeIndex, containerWidth, translateX]);

    return (
        <View
            testID="theme-toggle-container"
            style={[
                styles.menuContainer,
                {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    padding: 4,
                    height: 56,
                    justifyContent: 'center',
                },
            ]}
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
            {containerWidth > 0 && (
                <RNAnimated.View
                    pointerEvents="none"
                    testID="theme-toggle-highlight"
                    style={{
                        position: 'absolute',
                        left: 4,
                        top: 4,
                        bottom: 4,
                        width: (containerWidth - 8) / 3,
                        backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'white',
                        borderRadius: 24,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 3,
                        elevation: 2,
                        transform: [{ translateX }],
                    }}
                />
            )}

            <View style={{ flexDirection: 'row', flex: 1 }}>
                {options.map((value) => {
                    const isActive = currentTheme === value;
                    return (
                        <HapticPressable
                            key={value}
                            onPress={() => setTheme(value)}
                            testID={`theme-toggle-option-${value}`}
                            style={{
                                flex: 1,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 24,
                            }}
                            accessibilityRole="button"
                            hapticType="selection"
                        >
                            <Text
                                style={{
                                    fontSize: 14,
                                    fontWeight: isActive ? '700' : '500',
                                    color: isActive ? theme.textPrimary : theme.textSecondary,
                                    textTransform: 'capitalize',
                                }}
                            >
                                {optionLabels[value]}
                            </Text>
                        </HapticPressable>
                    );
                })}
            </View>
        </View>
    );
}
