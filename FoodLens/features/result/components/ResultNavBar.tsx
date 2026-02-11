import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { resultStyles as styles } from '../styles/resultStyles';

type ResultNavBarProps = {
    onBack: () => void;
};

export default function ResultNavBar({ onBack }: ResultNavBarProps) {
    return (
        <SafeAreaView style={styles.navSafeArea} edges={['top']}>
            <View style={styles.navBar}>
                <HapticTouchableOpacity onPress={onBack} style={styles.navButton} hapticType="light">
                    <View pointerEvents="none">
                        <Ionicons name="chevron-back" size={28} color="#1C1C1E" />
                    </View>
                </HapticTouchableOpacity>
                <View style={{ flex: 1 }} />
                <HapticTouchableOpacity style={styles.navButton} hapticType="light">
                    <Ionicons name="share-outline" size={22} color="#1C1C1E" />
                </HapticTouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
