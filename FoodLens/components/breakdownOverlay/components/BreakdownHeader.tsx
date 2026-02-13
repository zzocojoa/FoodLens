import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { getBreakdownOverlayStyles } from '../styles';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

type BreakdownHeaderProps = {
    onClose: () => void;
    panHandlers: any;
    t: (key: string, fallback?: string) => string;
};

export default function BreakdownHeader({ onClose, panHandlers, t }: BreakdownHeaderProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const styles = React.useMemo(() => getBreakdownOverlayStyles(theme), [theme]);
    return (
        <>
            <View style={styles.dragIndicatorContainer} {...panHandlers}>
                <View style={styles.dragIndicator} />
            </View>

            <View style={styles.header}>
                <View style={{ flex: 1 }} {...panHandlers}>
                    <Text style={styles.headerTitle}>
                        {t('result.breakdown.title', 'Molecular Breakdown')}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {t('result.breakdown.swipeToClose', 'SWIPE DOWN TO CLOSE')}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={onClose}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <View pointerEvents="none">
                        <X size={20} color="#94A3B8" />
                    </View>
                </TouchableOpacity>
            </View>
        </>
    );
}
