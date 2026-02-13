import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { SecureImage } from '@/components/SecureImage';
import TravelerAllergyCard from '@/components/TravelerAllergyCard';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { ResultErrorInfo } from '../types/result.types';
import { resultStyles as styles } from '../styles/resultStyles';

type ResultErrorStateProps = {
    imageSource: any;
    locationData: any;
    errorInfo: ResultErrorInfo;
};

export default function ResultErrorState({
    imageSource,
    locationData,
    errorInfo,
}: ResultErrorStateProps) {
    const router = useRouter();

    return (
            <View style={styles.errorContainer}>
            {imageSource && <SecureImage source={imageSource} style={styles.errorImage} resizeMode="cover" />}
            <ExpoBlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />

            <View style={styles.errorContent}>
                <View style={styles.errorIconCircle}>
                    <Ionicons name={errorInfo.icon as any} size={40} color="#3B82F6" />
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
                            SAFETY CARD (OFFLINE MODE)
                        </Text>
                        <TravelerAllergyCard countryCode={locationData.isoCountryCode} aiTranslation={null} />
                    </View>
                )}

                <HapticTouchableOpacity
                    style={styles.retryButton}
                    hapticType="medium"
                    onPress={() => router.replace('/scan/camera')}
                >
                    <Ionicons name="refresh" size={18} color="white" style={{ marginRight: 8 }} />
                    <Text style={styles.retryText}>다시 시도</Text>
                </HapticTouchableOpacity>

                <HapticTouchableOpacity style={styles.homeButton} hapticType="light" onPress={() => router.replace('/')}>
                    <Text style={styles.homeText}>홈으로 돌아가기</Text>
                </HapticTouchableOpacity>
            </View>
        </View>
    );
}
