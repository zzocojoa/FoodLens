import React from 'react';
import { Animated, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import BreakdownHeader from './breakdownOverlay/components/BreakdownHeader';
import IngredientsSection from './breakdownOverlay/components/IngredientsSection';
import NutritionSection from './breakdownOverlay/components/NutritionSection';
import { useBreakdownOverlayModel } from './breakdownOverlay/hooks/useBreakdownOverlayModel';
import { getBreakdownOverlayStyles } from './breakdownOverlay/styles';
import { BreakdownOverlayProps } from './breakdownOverlay/types';
import { useColorScheme } from '../hooks/use-color-scheme';
import { Colors } from '../constants/theme';

const BreakdownOverlay: React.FC<BreakdownOverlayProps> = ({ isOpen, onClose, resultData }) => {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const styles = React.useMemo(() => getBreakdownOverlayStyles(theme), [theme]);

    const { insets, translateY, opacity: manualOpacity, panResponder, shouldRender, model } = useBreakdownOverlayModel({
        isOpen,
        onClose,
        resultData,
    });

    const backdropOpacity = translateY.interpolate({
        inputRange: [0, 400],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    if (!shouldRender || !resultData || !model || !styles) return null;

    return (
        <Modal visible={isOpen} transparent animationType="none" onRequestClose={onClose}>
            <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
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
