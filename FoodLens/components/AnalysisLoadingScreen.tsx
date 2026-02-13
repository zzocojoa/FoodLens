import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { DEFAULT_IMAGE_URI, buildLoadingColors } from './analysisLoading/constants';
import AnalysisLoadingCore from './analysisLoading/components/AnalysisLoadingCore';
import AnalysisLoadingHud from './analysisLoading/components/AnalysisLoadingHud';
import { useAnalysisLoadingAnimations } from './analysisLoading/hooks/useAnalysisLoadingAnimations';
import { useAnalysisLoadingProgress } from './analysisLoading/hooks/useAnalysisLoadingProgress';
import { analysisLoadingStyles as styles } from './analysisLoading/styles';
import { AnalysisLoadingScreenProps } from './analysisLoading/types';

const AnalysisLoadingScreen: React.FC<AnalysisLoadingScreenProps> = ({
    onCancel,
    isError = false,
    imageUri,
    manualStep,
    manualProgress,
}) => {
    void onCancel;

    const colors = buildLoadingColors(isError);
    const animations = useAnalysisLoadingAnimations();
    const progress = useAnalysisLoadingProgress({ isError, manualStep, manualProgress });

    return (
        <View style={styles.container}>
            <View style={styles.backgroundLayer}>
                <Animated.Image 
                    source={{ uri: imageUri || DEFAULT_IMAGE_URI }} 
                    style={styles.backgroundImage} 
                    blurRadius={90} 
                />
                <View style={styles.darkOverlay} />
            </View>

            <AnalysisLoadingCore
                isError={isError}
                colors={colors}
                orbitStyle={animations.orbitStyle}
                orbitInnerStyle={animations.orbitInnerStyle}
                pulseStyle={animations.pulseStyle}
                rippleStyle={animations.rippleStyle}
            />

            <AnalysisLoadingHud
                isError={isError}
                colors={colors}
                mainMessage={progress.mainMessage}
                progressWidth={progress.progressWidth}
            />
        </View>
    );
};

export default AnalysisLoadingScreen;
