import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Flag } from 'lucide-react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { resultStyles as styles } from '../styles/resultStyles';

type ResultNavBarProps = {
    onBack: () => void;
    onReport: () => void;
    reportAccessibilityLabel: string;
};

const reportButtonHitSlop = {
    top: 12,
    right: 12,
    bottom: 12,
    left: 12,
} as const;

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
                        <ChevronLeft size={28} color="#1C1C1E" strokeWidth={2.4} />
                    </View>
                </HapticTouchableOpacity>
                <View style={{ flex: 1 }} />
                <HapticTouchableOpacity
                    onPress={onReport}
                    style={styles.navReportButton}
                    hapticType="light"
                    hitSlop={reportButtonHitSlop}
                    accessibilityRole="button"
                    accessibilityLabel={reportAccessibilityLabel}
                >
                    <Flag size={18} color="#64748B" strokeWidth={2.2} />
                </HapticTouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
