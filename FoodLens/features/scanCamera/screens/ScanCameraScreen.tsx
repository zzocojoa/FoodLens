import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { Info, X, Image as ImageIcon, Zap, ZapOff, ZoomIn, RotateCcw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AnalysisLoadingScreen from '../../../components/AnalysisLoadingScreen';
import { InfoBottomSheet } from '../../../components/InfoBottomSheet';
import { scanCameraStyles as styles } from '../styles/scanCameraStyles';
import { useScanCameraGateway } from '../hooks/useScanCameraGateway';

export default function ScanCameraScreen() {
    const camera = useScanCameraGateway();

    if (!camera.permission) return <View style={styles.container} />;

    if (!camera.permission.granted) {
        return (
            <View style={styles.permissionContainer}>
                <Text style={styles.permissionText}>카메라 접근 권한이 필요합니다.</Text>
                <TouchableOpacity style={styles.permissionButton} onPress={camera.requestPermission}>
                    <Text style={styles.permissionButtonText}>권한 허용하기</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeButton} onPress={camera.handleClose}>
                    <X size={24} color="white" />
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <InfoBottomSheet isOpen={camera.showInfoSheet} onClose={() => camera.setShowInfoSheet(false)} />

            {camera.isAnalyzing && (
                <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
                    <AnalysisLoadingScreen
                        onCancel={camera.handleCancelAnalysis}
                        imageUri={camera.capturedImage || ''}
                        manualStep={camera.activeStep ?? 0}
                        manualProgress={camera.uploadProgress}
                    />
                </View>
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
                <View style={styles.viewfinderContainer}>
                    <View style={[styles.corner, styles.tl]} />
                    <View style={[styles.corner, styles.tr]} />
                    <View style={[styles.corner, styles.bl]} />
                    <View style={[styles.corner, styles.br]} />

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

                    <Text style={styles.guideText}>
                        {camera.mode === 'FOOD'
                            ? '음식을 중앙에 맞춰주세요'
                            : camera.mode === 'LABEL'
                              ? '영양성분표를 가득 차게 찍어주세요'
                              : '바코드를 스캔하세요'}
                    </Text>
                </View>
            </View>

            <View style={styles.topBar}>
                <TouchableOpacity style={styles.iconButton} onPress={() => camera.setShowInfoSheet(true)}>
                    <Info size={24} color="white" />
                </TouchableOpacity>

                <View style={styles.topCenterControls}>
                    <TouchableOpacity onPress={camera.toggleFlash} style={styles.iconButton}>
                        {camera.flash === 'on' ? (
                            <Zap size={24} color="#FBBF24" fill="#FBBF24" />
                        ) : camera.flash === 'auto' ? (
                            <Zap size={24} color="white" />
                        ) : (
                            <ZapOff size={24} color="white" />
                        )}
                    </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={camera.handleClose} style={styles.iconButton}>
                    <X size={28} color="white" />
                </TouchableOpacity>
            </View>

            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)', 'black']} style={styles.bottomBar}>
                <View style={styles.contextControls}>
                    <TouchableOpacity onPress={camera.toggleZoom} style={styles.zoomButton}>
                        <ZoomIn size={20} color="white" />
                        <Text style={styles.zoomText}>{camera.zoom === 0 ? '1x' : '2x'}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.shutterRow}>
                    <TouchableOpacity onPress={camera.handleGallery} style={styles.galleryButton}>
                        <ImageIcon size={24} color="white" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={camera.handleCapture} style={styles.shutterButton} activeOpacity={0.8}>
                        <View
                            style={[styles.shutterInner, camera.mode === 'BARCODE' && styles.shutterInnerBarcode]}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={camera.toggleCameraFacing} style={styles.galleryButton}>
                        <RotateCcw size={24} color="white" />
                    </TouchableOpacity>
                </View>

                <View style={styles.modeSelector}>
                    {camera.MODES.map((m) => (
                        <TouchableOpacity
                            key={m.id}
                            onPress={() => {
                                camera.setMode(m.id);
                                Haptics.selectionAsync();
                            }}
                            style={[styles.modeChip, camera.mode === m.id && styles.modeChipActive]}
                        >
                            <Text style={[styles.modeText, camera.mode === m.id && styles.modeTextActive]}>
                                {m.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </LinearGradient>
        </SafeAreaView>
    );
}

