import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, Pressable, PressableProps } from 'react-native';
import { HapticsService } from '../services/haptics';

const runHapticSafe = (
    hapticType: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection',
) => {
    try {
        switch (hapticType) {
            case 'light': HapticsService.light(); break;
            case 'medium': HapticsService.medium(); break;
            case 'heavy': HapticsService.heavy(); break;
            case 'success': HapticsService.success(); break;
            case 'warning': HapticsService.warning(); break;
            case 'error': HapticsService.error(); break;
            case 'selection': HapticsService.selection(); break;
        }
    } catch (error) {
        console.warn('[HapticFeedback] haptic failed', error);
    }
};

// 1. Haptic TouchableOpacity
// Adds medium haptic feedback on press by default
export const HapticTouchableOpacity: React.FC<TouchableOpacityProps & { hapticType?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection' }> = ({ 
    onPress, 
    hapticType = 'light',
    children, 
    ...props 
}) => {
    
    const handlePress = (e: any) => {
        runHapticSafe(hapticType);
        onPress && onPress(e);
    };

    return (
        <TouchableOpacity {...props} onPress={handlePress}>
            {children}
        </TouchableOpacity>
    );
};

// 2. Haptic Pressable
// Adds medium haptic feedback on press by default
export const HapticPressable: React.FC<PressableProps & { hapticType?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection' }> = ({ 
    onPress, 
    hapticType = 'light',
    children, 
    ...props 
}) => {
    
    const handlePress = (e: any) => {
        runHapticSafe(hapticType);
        onPress && onPress(e);
    };

    return (
        <Pressable {...props} onPress={handlePress}>
            {children}
        </Pressable>
    );
};
