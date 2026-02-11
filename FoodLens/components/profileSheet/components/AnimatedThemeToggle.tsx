import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View, Animated as RNAnimated } from 'react-native';
import { profileSheetStyles as styles } from '../styles';

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
    const [containerWidth, setContainerWidth] = useState(0);
    const translateX = React.useRef(new RNAnimated.Value(0)).current;

    const options = ['light', 'dark', 'system'] as const;
    const activeIndex = options.indexOf(currentTheme as any);

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
                        <TouchableOpacity
                            key={value}
                            onPress={() => setTheme(value)}
                            style={{
                                flex: 1,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 24,
                            }}
                            activeOpacity={0.7}
                        >
                            <Text
                                style={{
                                    fontSize: 14,
                                    fontWeight: isActive ? '700' : '500',
                                    color: isActive ? theme.textPrimary : theme.textSecondary,
                                    textTransform: 'capitalize',
                                }}
                            >
                                {value}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}
