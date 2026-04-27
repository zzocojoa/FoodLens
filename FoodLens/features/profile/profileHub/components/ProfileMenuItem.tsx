import React from 'react';
import { Keyboard, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { HapticPressable } from '@/components/HapticFeedback';
import { profileHubStyles as styles } from '../styles';

type ProfileMenuItemProps = {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    onPress?: () => void;
    iconBgColor: string;
    theme: any;
    accessibilityLabel?: string;
    accessibilityHint?: string;
};

export default function ProfileMenuItem({
    icon,
    title,
    subtitle,
    onPress,
    iconBgColor,
    theme,
    accessibilityLabel,
    accessibilityHint,
}: ProfileMenuItemProps) {
    const hasAction = onPress !== undefined;
    const handlePress = React.useCallback((): void => {
        if (onPress === undefined) {
            return;
        }

        Keyboard.dismiss();
        requestAnimationFrame(() => {
            onPress();
        });
    }, [onPress]);

    const content = (
        <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={[styles.iconBox, { backgroundColor: iconBgColor }]}>{icon}</View>
                <View>
                    <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>{title}</Text>
                    <Text style={[styles.menuSub, { color: theme.textSecondary }]}>{subtitle}</Text>
                </View>
            </View>
            {hasAction ? <ChevronRight size={18} color={theme.textSecondary} /> : null}
        </>
    );

    return (
        <View style={[styles.menuContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {hasAction ? (
                <HapticPressable
                    accessibilityHint={accessibilityHint}
                    accessibilityLabel={accessibilityLabel}
                    accessibilityRole="button"
                    style={styles.menuItem}
                    onPress={handlePress}
                    hapticType="light"
                >
                    {content}
                </HapticPressable>
            ) : (
                <View style={styles.menuItem}>{content}</View>
            )}
        </View>
    );
}
