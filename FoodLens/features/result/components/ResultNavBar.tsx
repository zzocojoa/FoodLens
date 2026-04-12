import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { resultStyles as styles } from '../styles/resultStyles';

type ResultNavBarProps = {
    onBack: () => void;
    onReport: () => void;
    reportAccessibilityLabel: string;
};

export default function ResultNavBar({
    onBack,
    onReport,
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
                <HapticTouchableOpacity
                    onPress={onReport}
                    style={styles.navReportButton}
                    hapticType="light"
                    accessibilityRole="button"
                    accessibilityLabel={reportAccessibilityLabel}
                >
                    <Ionicons name="flag-outline" size={18} color="#64748B" />
                </HapticTouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
