import React from 'react';
import { Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { profileSheetStyles as styles } from '../styles';

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
    return (
        <View style={[styles.menuContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <HapticTouchableOpacity style={styles.menuItem} onPress={onPress} hapticType="light">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <View style={[styles.iconBox, { backgroundColor: iconBgColor }]}>{icon}</View>
                    <View>
                        <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>{title}</Text>
                        <Text style={[styles.menuSub, { color: theme.textSecondary }]}>{subtitle}</Text>
                    </View>
                </View>
                <ChevronRight size={18} color={theme.textSecondary} />
            </HapticTouchableOpacity>
        </View>
    );
}
