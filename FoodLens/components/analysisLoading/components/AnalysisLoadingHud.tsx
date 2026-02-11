import React from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { AnalysisLoadingColors } from '../types';
import { analysisLoadingStyles as styles } from '../styles';

type AnalysisLoadingHudProps = {
    isError: boolean;
    colors: AnalysisLoadingColors;
    mainMessage: string;
    progressWidth: string;
};

export default function AnalysisLoadingHud({
    isError,
    colors,
    mainMessage,
    progressWidth,
}: AnalysisLoadingHudProps) {
    return (
        <View style={styles.hudContainer}>
            <View style={styles.statusBadge}>
                <Text style={styles.statusText}>NEURAL CORE {isError ? 'ERROR' : 'ACTIVE'}</Text>
            </View>

            <View style={{ flex: 1 }} />

            <View style={styles.messageArea}>
                <Text style={styles.mainMessage}>{mainMessage}</Text>

                {!isError && (
                    <View style={styles.loadingDots}>
                        <View style={styles.dot} />
                        <View style={[styles.dot, { opacity: 0.6 }]} />
                        <View style={[styles.dot, { opacity: 0.3 }]} />
                    </View>
                )}

                <View style={styles.progressBarBg}>
                    <Animated.View
                        style={[
                            styles.progressBarFill,
                            {
                                width: progressWidth as any,
                                backgroundColor: colors.primary,
                            },
                        ]}
                    />
                </View>
            </View>
        </View>
    );
}
