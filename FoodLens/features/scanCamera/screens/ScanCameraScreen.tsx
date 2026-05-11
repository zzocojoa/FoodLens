import React from 'react';
import { AccessibilityInfo, View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Info, X, Image as ImageIcon, Zap, ZapOff, ZoomIn, RotateCcw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AnalysisLoadingScreen from '../../../components/AnalysisLoadingScreen';
import { AnalysisOrbs } from '../../../components/animation/AnalysisOrbs';
import { InfoBottomSheet } from '../../../components/InfoBottomSheet';
import { scanCameraStyles as styles } from '../styles/scanCameraStyles';
import { useScanCameraGateway } from '../hooks/useScanCameraGateway';
import { useI18n } from '@/features/i18n';

export default function ScanCameraScreen() {
    const { t } = useI18n();
    const insets = useSafeAreaInsets();
    const camera = useScanCameraGateway();
    const [isReduceMotionEnabled, setIsReduceMotionEnabled] = React.useState<boolean>(false);

    React.useEffect(() => {
        let isMounted = true;

        void AccessibilityInfo.isReduceMotionEnabled().then((isEnabled: boolean) => {
            if (!isMounted) {
                return;
            }

            setIsReduceMotionEnabled(isEnabled);
        });

        const subscription = AccessibilityInfo.addEventListener(
            'reduceMotionChanged',
            (isEnabled: boolean) => {
                setIsReduceMotionEnabled(isEnabled);
            },
        );

        return () => {
            isMounted = false;
            subscription.remove();
        };
    }, []);

    if (!camera.permission) return <View collapsable={false} testID="scan-camera-screen" style={styles.container} />;

    if (!camera.permission.granted) {
        return (
            <View collapsable={false} testID="scan-camera-screen" style={styles.permissionContainer}>
                <Text style={styles.permissionText}>{t('scan.permission.cameraRequired', 'Camera access is required.')}</Text>
                <TouchableOpacity
                    accessibilityLabel={t('scan.permission.grant', 'Grant Permission')}
                    accessibilityRole="button"
                    style={styles.permissionButton}
                    onPress={camera.requestPermission}
                >
                    <Text style={styles.permissionButtonText}>{t('scan.permission.grant', 'Grant Permission')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    testID="scan-camera-close-button"
                    accessibilityLabel={t('scan.action.close', 'Close camera')}
                    accessibilityRole="button"
                    style={styles.closeButton}
                    onPress={camera.handleClose}
                >
                    <X size={24} color="white" />
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View collapsable={false} testID="scan-camera-screen" style={styles.container}>
            <InfoBottomSheet isOpen={camera.showInfoSheet} onClose={() => camera.setShowInfoSheet(false)} />

            {camera.isAnalyzing && (
                <>
                    {!isReduceMotionEnabled ? <AnalysisOrbs /> : null}
                    <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
                        <AnalysisLoadingScreen
                            onCancel={camera.handleCancelAnalysis}
                            imageUri={camera.capturedImage || ''}
                            manualStep={camera.activeStep ?? 0}
                            manualProgress={camera.uploadProgress}
                        />
                    </View>
                </>
            )}

            {camera.isFocused && (
                <CameraView
                    style={StyleSheet.absoluteFill}
                    facing={camera.facing}
                    flash={camera.flash}
                    zoom={camera.zoom}
                    ref={camera.cameraRef}
                    onBarcodeScanned={camera.mode === 'BARCODE' ? camera.handleBarcodeScanned : undefined}
                    barcodeScannerSettings={{
                        barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'],
                    }}
                />
            )}

            <View style={styles.overlay} pointerEvents="none">
                {camera.mode === 'BARCODE' && (
                    <>
                        <BlurView intensity={20} style={styles.blurTop} tint="dark" />
                        <BlurView intensity={20} style={styles.blurBottom} tint="dark" />
                        <BlurView intensity={20} style={styles.blurLeft} tint="dark" />
                        <BlurView intensity={20} style={styles.blurRight} tint="dark" />
                    </>
                )}
                <View style={styles.viewfinderContainer}>
                    {camera.mode !== 'LABEL' && (
                        <>
                            <View style={[styles.corner, styles.tl]} />
                            <View style={[styles.corner, styles.tr]} />
                            <View style={[styles.corner, styles.bl]} />
                            <View style={[styles.corner, styles.br]} />
                        </>
                    )}

                    {camera.mode === 'BARCODE' && (
                        <Animated.View
                            style={[
                                styles.laserContainer,
                                {
                                    transform: [
                                        {
                                            translateY: camera.laserAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0, 240],
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        >
                            <LinearGradient
                                colors={[
                                    'rgba(255, 59, 48, 0)',
                                    'rgba(255, 59, 48, 0.8)',
                                    'rgba(255, 255, 255, 1)',
                                    'rgba(255, 59, 48, 0.8)',
                                    'rgba(255, 59, 48, 0)',
                                ]}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                locations={[0, 0.2, 0.5, 0.8, 1]}
                                style={styles.premiumLaser}
                            />
                        </Animated.View>
                    )}
                </View>
            </View>

            <View style={[styles.topBar, { paddingTop: Math.max(18, insets.top + 10) }]}>
                <TouchableOpacity
                    accessibilityLabel={t('scan.action.info', 'Open scan tips')}
                    accessibilityRole="button"
                    style={styles.iconButton}
                    onPress={() => camera.setShowInfoSheet(true)}
                >
                    <Info size={24} color="white" />
                </TouchableOpacity>

                <View style={styles.topCenterControls}>
                    <TouchableOpacity
                        accessibilityLabel={t('scan.action.flash', 'Change flash mode')}
                        accessibilityRole="button"
                        onPress={camera.toggleFlash}
                        style={styles.iconButton}
                    >
                        {camera.flash === 'on' ? (
                            <Zap size={24} color="#FBBF24" fill="#FBBF24" />
                        ) : camera.flash === 'auto' ? (
                            <Zap size={24} color="white" />
                        ) : (
                            <ZapOff size={24} color="white" />
                        )}
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    testID="scan-camera-close-button"
                    accessibilityLabel={t('scan.action.close', 'Close camera')}
                    accessibilityRole="button"
                    onPress={camera.handleClose}
                    style={styles.iconButton}
                >
                    <X size={28} color="white" />
                </TouchableOpacity>
            </View>

            <View style={styles.guideTextTopContainer} pointerEvents="none">
                <Text style={styles.guideText}>
                    {camera.mode === 'FOOD'
                        ? t('scan.guide.food', 'Center the food in frame')
                        : camera.mode === 'LABEL'
                          ? t('scan.guide.label', 'Fill the frame with the nutrition label')
                          : t('scan.guide.barcode', 'Scan the barcode')}
                </Text>
            </View>

            <LinearGradient
                colors={['transparent', 'rgba(255,252,247,0.9)', 'rgba(251,247,238,0.98)']}
                style={[
                    styles.bottomBar,
                    {
                        paddingBottom: Math.max(28, insets.bottom + 18),
                    },
                ]}
            >
                <View style={styles.contextControls}>
                    <TouchableOpacity
                        accessibilityLabel={t('scan.action.zoom', 'Toggle camera zoom')}
                        accessibilityRole="button"
                        onPress={camera.toggleZoom}
                        style={styles.zoomButton}
                    >
                        <ZoomIn size={20} color="#172033" />
                        <Text style={styles.zoomText}>{camera.zoom === 0 ? '1x' : '2x'}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.shutterRow}>
                    <TouchableOpacity
                        accessibilityLabel={t('scan.action.gallery', 'Choose from photo library')}
                        accessibilityRole="button"
                        onPress={camera.handleGallery}
                        style={styles.galleryButton}
                    >
                        <ImageIcon size={24} color="#172033" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        accessibilityLabel={t('scan.action.capture', 'Capture food photo')}
                        accessibilityRole="button"
                        onPress={camera.handleCapture}
                        style={styles.shutterButton}
                        activeOpacity={0.8}
                    >
                        <View
                            style={[styles.shutterInner, camera.mode === 'BARCODE' && styles.shutterInnerBarcode]}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        accessibilityLabel={t('scan.action.flipCamera', 'Switch camera')}
                        accessibilityRole="button"
                        onPress={camera.toggleCameraFacing}
                        style={styles.galleryButton}
                    >
                        <RotateCcw size={24} color="#172033" />
                    </TouchableOpacity>
                </View>

                <View style={styles.modeSelector}>
                    {camera.MODES.map((m) => (
                        <TouchableOpacity
                            key={m.id}
                            accessibilityLabel={
                                m.id === 'LABEL'
                                    ? t('scan.mode.label', 'Label')
                                    : m.id === 'FOOD'
                                      ? t('scan.mode.food', 'Food')
                                      : t('scan.mode.barcode', 'Barcode')
                            }
                            accessibilityRole="button"
                            accessibilityState={{ selected: camera.mode === m.id }}
                            onPress={() => {
                                camera.setMode(m.id);
                                Haptics.selectionAsync();
                            }}
                            style={[styles.modeChip, camera.mode === m.id && styles.modeChipActive]}
                        >
                            <Text style={[styles.modeText, camera.mode === m.id && styles.modeTextActive]}>
                                {m.id === 'LABEL'
                                    ? t('scan.mode.label', 'Label')
                                    : m.id === 'FOOD'
                                      ? t('scan.mode.food', 'Food')
                                      : t('scan.mode.barcode', 'Barcode')}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </LinearGradient>
        </View>
    );
}
