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
};

export default function ProfileMenuItem({
    icon,
    title,
    subtitle,
    onPress,
    iconBgColor,
    theme,
}: ProfileMenuItemProps) {
    const handlePress = React.useCallback(() => {
        Keyboard.dismiss();
        requestAnimationFrame(() => {
            onPress?.();
        });
    }, [onPress]);

    return (
        <View style={[styles.menuContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <HapticPressable style={styles.menuItem} onPress={handlePress} hapticType="light">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <View style={[styles.iconBox, { backgroundColor: iconBgColor }]}>{icon}</View>
                    <View>
                        <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>{title}</Text>
                        <Text style={[styles.menuSub, { color: theme.textSecondary }]}>{subtitle}</Text>
                    </View>
                </View>
                <ChevronRight size={18} color={theme.textSecondary} />
            </HapticPressable>
        </View>
    );
}
