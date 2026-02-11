import React from 'react';
import { Animated, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BreakdownHeader from './breakdownOverlay/components/BreakdownHeader';
import IngredientsSection from './breakdownOverlay/components/IngredientsSection';
import NutritionSection from './breakdownOverlay/components/NutritionSection';
import { useBreakdownPanGesture } from './breakdownOverlay/hooks/useBreakdownPanGesture';
import { breakdownOverlayStyles as styles } from './breakdownOverlay/styles';
import { BreakdownOverlayProps } from './breakdownOverlay/types';
import { buildBreakdownViewModel } from './breakdownOverlay/utils/breakdownData';

const BreakdownOverlay: React.FC<BreakdownOverlayProps> = ({ isOpen, onClose, resultData }) => {
    const insets = useSafeAreaInsets();
    const { translateY, opacity, panResponder } = useBreakdownPanGesture(onClose);

    if (!isOpen || !resultData) return null;

    const model = buildBreakdownViewModel(resultData);

    return (
        <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
            <Animated.View style={[styles.backdrop, { opacity }]}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            transform: [{ translateY }],
                            paddingBottom: insets.bottom + 20,
                        },
                    ]}
                >
                    <BreakdownHeader onClose={onClose} panHandlers={panResponder.panHandlers} />

                    <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
                        {model.hasAllergens && (
                            <View style={styles.allergenBanner}>
                                <AlertTriangle size={18} color="#F43F5E" />
                                <Text style={styles.allergenText}>Contains Allergens</Text>
                            </View>
                        )}

                        <NutritionSection model={model} />
                        <IngredientsSection resultData={resultData} model={model} />
                    </ScrollView>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

export default BreakdownOverlay;
