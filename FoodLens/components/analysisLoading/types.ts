import { SharedValue } from 'react-native-reanimated';

export type AnalysisLoadingScreenProps = {
    onCancel: () => void;
    isError?: boolean;
    imageUri?: string;
    manualStep?: number;
    manualProgress?: number;
};

export type AnalysisLoadingColors = {
    primary: string;
    orbit: string;
    orbitInner: string;
    ripple: string;
    hub: string;
    icon: string;
};

export type AnalysisLoadingAnimationStyles = {
    orbitStyle: { transform: { rotate: string }[] };
    orbitInnerStyle: { transform: { rotate: string }[] };
    pulseStyle: { transform: { scale: number }[] };
    rippleStyle: { transform: { scale: number }[]; opacity: number };
};

export type AnalysisLoadingAnimationValues = {
    rotation: SharedValue<number>;
    pulseScale: SharedValue<number>;
    rippleScale: SharedValue<number>;
    rippleOpacity: SharedValue<number>;
};
