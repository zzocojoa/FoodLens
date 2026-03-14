import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import AnalysisLoadingScreen from '../../../components/AnalysisLoadingScreen';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import CameraPermissionGate from '../components/CameraPermissionGate';
import { useCameraGateway } from '../hooks/useCameraGateway';
import { cameraStyles as styles } from '../styles/cameraStyles';
import { CameraRouteParams } from '../types/camera.types';
import { useI18n } from '@/features/i18n';
import { openAppSettings } from '@/services/ui/permissionDialogs';
import { buildResultRoute } from '@/services/contracts/resultRoute';

export default function CameraScreen() {
    const router = useRouter();
    const { t } = useI18n();
    const params = useLocalSearchParams<CameraRouteParams>();
    const { isConnected } = useNetworkStatus();

    const camera = useCameraGateway({
        params,
        isConnected: !!isConnected,
        onExit: () => router.replace('/'),
        onSuccess: () => router.replace(buildResultRoute({ isNew: true, sourceType: 'camera' })),
    });

    if (!camera.permission) {
        return (
            <View style={styles.container}>
                <Stack.Screen options={{ headerShown: false }} />
            </View>
        );
    }

    if (camera.permission && !camera.permission.granted && !camera.externalImageUri) {
        return (
            <>
                <Stack.Screen options={{ headerShown: false }} />
                <CameraPermissionGate onOpenSettings={openAppSettings} />
            </>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <Image
                source={{
                    uri: 'https://images.unsplash.com/photo-1495195134817-aeb325a55b65?q=80&w=2676&auto=format&fit=crop',
                }}
                style={StyleSheet.absoluteFillObject}
                blurRadius={20}
            />
            <View style={styles.darkOverlay} />

            {camera.externalImageUri ? (
                <AnalysisLoadingScreen
                    onCancel={camera.handleCancelAnalysis}
                    imageUri={camera.capturedImage || camera.externalImageUri}
                    manualStep={camera.activeStep ?? 0}
                    manualProgress={camera.uploadProgress}
                />
            ) : !camera.isLocationReady ? null : (
                <View style={styles.launchingTextContainer}>
                    <Text style={styles.launchingText}>
                        {t('camera.loading.preparing', 'Preparing Camera...')}
                    </Text>
                </View>
            )}
        </View>
    );
}
