import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { resultStyles as styles } from '../styles/resultStyles';

type ResultNavBarProps = {
    onBack: () => void;
    onShare: () => void;
    onReport: () => void;
    shareAccessibilityLabel: string;
    reportAccessibilityLabel: string;
};

export default function ResultNavBar({
    onBack,
    onShare,
    onReport,
    shareAccessibilityLabel,
    reportAccessibilityLabel,
}: ResultNavBarProps) {
    return (
        <SafeAreaView style={styles.navSafeArea} edges={['top']}>
            <View style={styles.navBar}>
                <HapticTouchableOpacity onPress={onBack} style={styles.navButton} hapticType="light">
                    <View pointerEvents="none">
                        <Ionicons name="chevron-back" size={28} color="#1C1C1E" />
                    </View>
                </HapticTouchableOpacity>
                <View style={{ flex: 1 }} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <HapticTouchableOpacity
                        onPress={onReport}
                        style={styles.navUtilityButton}
                        hapticType="light"
                        accessibilityRole="button"
                        accessibilityLabel={reportAccessibilityLabel}
                    >
                        <Ionicons name="flag-outline" size={18} color="#64748B" />
                    </HapticTouchableOpacity>
                    <HapticTouchableOpacity
                        onPress={onShare}
                        style={styles.navUtilityButton}
                        hapticType="light"
                        accessibilityRole="button"
                        accessibilityLabel={shareAccessibilityLabel}
                    >
                        <Ionicons name="share-outline" size={20} color="#64748B" />
                    </HapticTouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}
