import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import {
    CameraView,
    CameraType,
    FlashMode,
    useCameraPermissions,
    BarcodeScanningResult,
} from 'expo-camera';
import { useAppNavigation } from '../../../hooks/use-app-navigation';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { analyzeImage, analyzeLabel, analyzeSmart } from '../../../services/ai';
import { dataStore } from '../../../services/dataStore';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { MODES } from '../constants/scanCamera.constants';
import { CameraMode } from '../types/scanCamera.types';
import { createFallbackLocation } from '../utils/scanCameraMappers';
import { resolveGalleryMetadata } from '../utils/galleryMetadata';
import { useScanCameraLaserAnimation } from './useScanCameraLaserAnimation';
import { lookupBarcodeWithCache, normalizeBarcodeIngredients } from '../services/scanCameraBarcodeService';
import { isBarcodeInCenteredRoi, evaluateScanConfidence } from '../utils/barcodeScannerUtils';
import { runAnalysisFlow } from '../services/scanCameraAnalysisService';

export const useScanCameraGateway = () => {
    const { navigate, replace, back } = useAppNavigation();
    const isFocused = useIsFocused();
    const cameraRef = useRef<CameraView>(null);

    const [permission, requestPermission] = useCameraPermissions();
    const [mode, setMode] = useState<CameraMode>('FOOD');
    const [facing, setFacing] = useState<CameraType>('back');
    const [flash, setFlash] = useState<FlashMode>('off');
    const [zoom, setZoom] = useState(0);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined);
    const [activeStep, setActiveStep] = useState<number | undefined>(undefined);
    const [scanned, setScanned] = useState(false);
    const [showInfoSheet, setShowInfoSheet] = useState(false);

    const isCancelled = useRef(false);
    const isProcessingRef = useRef(false);
    const cachedLocation = useRef<any>(undefined);
    const processImageRef = useRef<
        (uri: string, customSourceType?: 'camera' | 'library', customTimestamp?: string | null, customLocation?: any) => Promise<void>
    >(async () => {});

    const { isConnected } = useNetworkStatus();
    const isConnectedRef = useRef(true);

    useEffect(() => {
        isConnectedRef.current = isConnected;
    }, [isConnected]);

    useEffect(() => {
        setScanned(false);
        isProcessingRef.current = false;
    }, [mode]);

    const laserAnim = useScanCameraLaserAnimation(mode);

    const toggleFlash = () => {
        setFlash((current) => {
            if (current === 'off') return 'on';
            if (current === 'on') return 'auto';
            return 'off';
        });
        Haptics.selectionAsync();
    };

    const toggleZoom = () => {
        setZoom((current) => (current === 0 ? 0.05 : 0));
        Haptics.selectionAsync();
    };

    const toggleCameraFacing = () => {
        setFacing((current) => (current === 'back' ? 'front' : 'back'));
        Haptics.selectionAsync();
    };

    const resetState = useCallback(() => {
        setIsAnalyzing(false);
        setCapturedImage(null);
        setUploadProgress(undefined);
        setActiveStep(undefined);
        setScanned(false);
        isProcessingRef.current = false;
    }, []);

    const handleCancelAnalysis = useCallback(() => {
        isCancelled.current = true;
        resetState();
    }, [resetState]);

    const handleClose = () => {
        if (isAnalyzing) {
            handleCancelAnalysis();
        } else {
            back();
        }
    };

    const handleError = useCallback(
        (error: any) => {
            console.error(error);
            resetState();

            const errorMessage = error?.message?.toLowerCase() || '';
            if (errorMessage.includes('status 5') || errorMessage.includes('status 500')) {
                Alert.alert('서버 오류', '일시적인 서버 문제가 발생했습니다.');
            } else {
                Alert.alert('분석 실패', '문제가 발생했습니다. 다시 시도해주세요.');
            }
        },
        [resetState]
    );

    const [consecutiveScans, setConsecutiveScans] = useState(0);
    const lastScannedData = useRef<string | null>(null);

    const processBarcode = useCallback(
        async (barcode: string) => {
            try {
                setIsAnalyzing(true);
                setActiveStep(0);

                if (!isConnectedRef.current) {
                    Alert.alert('오프라인', '인터넷 연결을 확인해주세요.');
                    resetState();
                    return;
                }

                const result = await lookupBarcodeWithCache(barcode);

                if (result.found && result.data) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    const product = normalizeBarcodeIngredients(result.data);

                    const locationData = cachedLocation.current || createFallbackLocation(0, 0, 'US');
                    const finalTimestamp = new Date().toISOString();

                    dataStore.setData(
                        product,
                        locationData,
                        (product.raw_data as any)?.image_url || null,
                        finalTimestamp
                    );

                    replace({
                        pathname: '/result',
                        params: { fromStore: 'true', isNew: 'true', isBarcode: 'true' },
                    });

                    resetState();
                } else {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    setIsAnalyzing(false);

                    Alert.alert('제품 정보 없음', '등록되지 않은 바코드입니다.\n사진으로 성분표를 분석하시겠습니까?', [
                        {
                            text: '취소',
                            style: 'cancel',
                            onPress: () => {
                                setScanned(false);
                                isProcessingRef.current = false;
                                setConsecutiveScans(0);
                            },
                        },
                        {
                            text: '촬영하기',
                            onPress: () => {
                                setMode('LABEL');
                                setScanned(false);
                                isProcessingRef.current = false;
                                setConsecutiveScans(0);
                            },
                        },
                    ]);
                }
            } catch (e: any) {
                console.error('Barcode Error:', e);
                Alert.alert('오류', '바코드 조회 중 문제가 발생했습니다.');
                resetState();
            }
        },
        [resetState, replace]
    );

    const handleBarcodeScanned = useCallback(
        (scanningResult: BarcodeScanningResult) => {
            if (mode !== 'BARCODE' || scanned || isAnalyzing || isProcessingRef.current) return;

            if (!isBarcodeInCenteredRoi(scanningResult, 280)) return;

            const confidence = evaluateScanConfidence({
                currentData: scanningResult.data,
                lastData: lastScannedData.current,
                consecutiveScans,
                requiredMatches: 3,
            });

            lastScannedData.current = confidence.nextLastData;
            setConsecutiveScans(confidence.nextCount);

            if (confidence.action === 'accept') {
                isProcessingRef.current = true;
                setScanned(true);
                processBarcode(scanningResult.data);
            }
        },
        [isAnalyzing, mode, processBarcode, scanned, consecutiveScans]
    );

    const processImage = useCallback(
        async (
            uri: string,
            customSourceType: 'camera' | 'library' = 'camera',
            customTimestamp?: string | null,
            customLocation?: any
        ) => {
            void customSourceType;
            await runAnalysisFlow({
                uri,
                timestamp: customTimestamp,
                customLocation,
                fallbackAddress: 'Location Unavailable',
                needsFileValidation: true,
                analyzer: analyzeImage,
                isCancelled,
                isConnectedRef,
                cachedLocation,
                setIsAnalyzing,
                setCapturedImage,
                setActiveStep,
                setUploadProgress,
                replace,
                resetState,
                handleError,
            });
        },
        [handleError, resetState, replace]
    );

    useEffect(() => {
        processImageRef.current = processImage;
    }, [processImage]);

    const processLabel = useCallback(
        async (uri: string, customTimestamp?: string | null) => {
            await runAnalysisFlow({
                uri,
                timestamp: customTimestamp,
                needsFileValidation: false,
                analyzer: analyzeLabel,
                isCancelled,
                isConnectedRef,
                cachedLocation,
                setIsAnalyzing,
                setCapturedImage,
                setActiveStep,
                setUploadProgress,
                replace,
                resetState,
                handleError,
            });
        },
        [handleError, resetState, replace]
    );

    const processSmart = useCallback(
        async (
            uri: string,
            customTimestamp?: string | null,
            customLocation?: any
        ) => {
            await runAnalysisFlow({
                uri,
                timestamp: customTimestamp,
                customLocation,
                fallbackAddress: 'Location Unavailable',
                needsFileValidation: true,
                analyzer: analyzeSmart,
                isCancelled,
                isConnectedRef,
                cachedLocation,
                setIsAnalyzing,
                setCapturedImage,
                setActiveStep,
                setUploadProgress,
                replace,
                resetState,
                handleError,
            });
        },
        [handleError, resetState, replace]
    );



    const handleCapture = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        if (cameraRef.current) {
            try {
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.5,
                    base64: false,
                    exif: true,
                });

                if (photo && photo.uri) {
                    const exifDate = photo.exif?.DateTimeOriginal || photo.exif?.DateTime || null;

                    if (mode === 'BARCODE') {
                        Alert.alert('알림', '바코드를 카메라에 비춰주세요.');
                    } else if (mode === 'LABEL') {
                        processLabel(photo.uri, exifDate);
                    } else {
                        processImage(photo.uri, 'camera', exifDate);
                    }
                }
            } catch (e) {
                console.error(e);
                Alert.alert('Error', '촬영에 실패했습니다.');
            }
        }
    };

    const handleGallery = async () => {
        Haptics.selectionAsync();

        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                quality: 0.8,
                exif: true,
            });

            if (!result.canceled && result.assets[0].uri) {
                const asset = result.assets[0];
                const uri = asset.uri;

                const { timestamp: finalDate, exifLocation } = await resolveGalleryMetadata(asset);

                if (mode === 'LABEL') {
                    // Legacy manual mode override (optional, but SmartRouter handles label too)
                    // Let's decide to force Smart Router for Gallery to be "Smart"
                    processSmart(uri, finalDate, exifLocation);
                } else {
                     processSmart(uri, finalDate, exifLocation);
                }
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Error', '갤러리를 열 수 없습니다.');
        }
    };

    return {
        cameraRef,
        isFocused,
        permission,
        requestPermission,
        mode,
        setMode,
        facing,
        flash,
        zoom,
        isAnalyzing,
        capturedImage,
        uploadProgress,
        activeStep,
        showInfoSheet,
        setShowInfoSheet,
        scanned,
        laserAnim,
        toggleFlash,
        toggleZoom,
        toggleCameraFacing,
        handleClose,
        handleCancelAnalysis,
        handleBarcodeScanned,
        handleCapture,
        handleGallery,
        MODES,
    };
};
