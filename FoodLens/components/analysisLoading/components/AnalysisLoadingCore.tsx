import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { AlertTriangle, Sparkles } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { AnalysisLoadingColors } from '../types';
import { analysisLoadingStyles as styles } from '../styles';

type AnalysisLoadingCoreProps = {
    isError: boolean;
    colors: AnalysisLoadingColors;
    orbitStyle: any;
    orbitInnerStyle: any;
    pulseStyle: any;
    rippleStyle: any;
};

export default function AnalysisLoadingCore({
    isError,
    colors,
    orbitStyle,
    orbitInnerStyle,
    pulseStyle,
    rippleStyle,
}: AnalysisLoadingCoreProps) {
    return (
        <View style={styles.coreContainer}>
            <Animated.View style={[styles.orbitRing, orbitStyle, { borderColor: colors.orbit }]} />
            <Animated.View style={[styles.orbitRingInner, orbitInnerStyle, { borderColor: colors.orbitInner }]} />

            <Animated.View style={[styles.ripple, rippleStyle, { borderColor: colors.ripple }]} />

            <Animated.View style={[styles.hub, pulseStyle, { borderColor: colors.hub }]}>
                <BlurView intensity={40} tint="dark" style={styles.hubBlur}>
                    <View style={styles.iconCircle}>
                        {isError ? (
                            <AlertTriangle size={24} color={colors.icon} fill={colors.icon} />
                        ) : (
                            <Sparkles size={24} color={colors.icon} fill={colors.icon} />
                        )}
                    </View>
                </BlurView>
            </Animated.View>
        </View>
    );
}
