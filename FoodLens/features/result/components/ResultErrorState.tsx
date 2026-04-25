import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView as ExpoBlurView } from 'expo-blur';
import {
    Camera,
    Clock3,
    Image as ImageIcon,
    RefreshCw,
    type LucideIcon,
} from 'lucide-react-native';
import { SecureImage } from '@/components/SecureImage';
import TravelerAllergyCard from '@/components/TravelerAllergyCard';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { ResultErrorInfo } from '../types/result.types';
import { resultStyles as styles } from '../styles/resultStyles';

type ResultErrorStateProps = {
    imageSource: any;
    locationData: any;
    errorInfo: ResultErrorInfo;
    t: (key: string, fallback?: string) => string;
};

const resolveErrorIcon = (iconName: string): LucideIcon => {
    if (iconName === 'time-outline') {
        return Clock3;
    }

    if (iconName === 'image-outline') {
        return ImageIcon;
    }

    return Camera;
};

export default function ResultErrorState({
    imageSource,
    locationData,
    errorInfo,
    t,
}: ResultErrorStateProps) {
    const router = useRouter();
    const ErrorIcon = resolveErrorIcon(errorInfo.icon);

    return (
            <View style={styles.errorContainer}>
            {imageSource && <SecureImage source={imageSource} style={styles.errorImage} resizeMode="cover" />}
            <ExpoBlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />

            <View style={styles.errorContent}>
                <View style={styles.errorIconCircle}>
                    <ErrorIcon size={40} color="#3B82F6" strokeWidth={2.2} />
                </View>
                <Text style={styles.errorTitle}>{errorInfo.title}</Text>
                <Text style={styles.errorDesc}>{errorInfo.desc}</Text>

                {locationData?.isoCountryCode && (
                    <View style={{ width: '100%', marginBottom: 24 }}>
                        <Text
                            style={{
                                color: '#64748B',
                                fontSize: 10,
                                fontWeight: '700',
                                letterSpacing: 1,
                                marginBottom: 8,
                                textAlign: 'center',
                            }}
                        >
                            {t('result.error.safetyCardOffline', 'SAFETY CARD (OFFLINE MODE)')}
                        </Text>
                        <TravelerAllergyCard countryCode={locationData.isoCountryCode} aiTranslation={null} />
                    </View>
                )}

                <HapticTouchableOpacity
                    style={styles.retryButton}
                    hapticType="medium"
                    onPress={() => router.replace('/scan/camera')}
                >
                    <RefreshCw size={18} color="white" strokeWidth={2.2} style={{ marginRight: 8 }} />
                    <Text style={styles.retryText}>{t('result.error.retry', 'Retry')}</Text>
                </HapticTouchableOpacity>

                <HapticTouchableOpacity
                    style={styles.homeButton}
                    hapticType="light"
                    onPress={() => router.replace('/(tabs)')}
                >
                    <Text style={styles.homeText}>{t('result.error.backHome', 'Back to Home')}</Text>
                </HapticTouchableOpacity>
            </View>
        </View>
    );
}
