import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Alert, Animated, Easing } from 'react-native';
import {
    CameraView,
    CameraType,
    FlashMode,
    useCameraPermissions,
    BarcodeScanningResult,
} from 'expo-camera';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { analyzeImage, analyzeLabel, analyzeSmart, lookupBarcode } from '../../../services/ai';
import { dataStore } from '../../../services/dataStore';
import { getLocationData } from '../../../services/utils';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { MODES } from '../constants/scanCamera.constants';
import { CameraMode } from '../types/scanCamera.types';
import { createFallbackLocation } from '../utils/scanCameraMappers';
import {
    assertImageFileReady,
    beginAnalysis,
    createProgressHandler,
    getIsoCode,
    persistAndNavigateAnalysisResult,
} from '../utils/scanCameraGatewayHelpers';
import { resolveGalleryMetadata } from '../utils/galleryMetadata';

export const useScanCameraGateway = () => {
    const router = useRouter();
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

    const laserAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (mode === 'BARCODE') {
            laserAnim.setValue(0);
            Animated.loop(
                Animated.sequence([
                    Animated.timing(laserAnim, {
                        toValue: 1,
                        duration: 1500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(laserAnim, {
                        toValue: 0,
                        duration: 1500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            laserAnim.stopAnimation();
            laserAnim.setValue(0);
        }
    }, [laserAnim, mode]);

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
            router.back();
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

                const result = await lookupBarcode(barcode);

                if (result.found && result.data) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    const product = result.data;

                    if (
                        product.ingredients &&
                        product.ingredients.length > 0 &&
                        typeof product.ingredients[0] === 'string'
                    ) {
                        product.ingredients = (product.ingredients as any).map((ing: string) => ({
                            name: ing,
                            isAllergen: false,
                        }));
                    }

                    const locationData = cachedLocation.current || createFallbackLocation(0, 0, 'US');
                    const finalTimestamp = new Date().toISOString();

                    dataStore.setData(
                        product,
                        locationData,
                        (product.raw_data as any)?.image_url || null,
                        finalTimestamp
                    );

                    router.replace({
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
                            },
                        },
                        {
                            text: '촬영하기',
                            onPress: () => {
                                setMode('LABEL');
                                setScanned(false);
                                isProcessingRef.current = false;
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
        [resetState, router]
    );

    const handleBarcodeScanned = useCallback(
        (scanningResult: BarcodeScanningResult) => {
            if (mode !== 'BARCODE' || scanned || isAnalyzing || isProcessingRef.current) return;

            isProcessingRef.current = true;
            setScanned(true);
            processBarcode(scanningResult.data);
        },
        [isAnalyzing, mode, processBarcode, scanned]
    );

    const processImage = useCallback(
        async (
            uri: string,
            customSourceType: 'camera' | 'library' = 'camera',
            customTimestamp?: string | null,
            customLocation?: any
        ) => {
            try {
                isCancelled.current = false;
                beginAnalysis({ uri, setIsAnalyzing, setCapturedImage, setActiveStep });

                let locationData = customLocation || cachedLocation.current;
                if (!locationData) {
                    try {
                        locationData = await getLocationData();
                        if (locationData) cachedLocation.current = locationData;
                    } catch (e) {
                        console.warn('Location fetch failed', e);
                    }
                }

                if (isCancelled.current) return;

                if (!isConnectedRef.current) {
                    Alert.alert('오프라인', '인터넷 연결을 확인해주세요.');
                    resetState();
                    return;
                }

                const isoCode = getIsoCode(locationData, 'US');
                await assertImageFileReady(uri);

                setActiveStep(1);
                setUploadProgress(0);

                const analysisResult = await analyzeImage(
                    uri,
                    isoCode,
                    createProgressHandler({ isCancelled, setUploadProgress, setActiveStep })
                );

                if (isCancelled.current) return;

                setActiveStep(3);

                await persistAndNavigateAnalysisResult({
                    analysisResult,
                    locationData,
                    isoCode,
                    timestamp: customTimestamp,
                    imageUri: uri,
                    fallbackAddress: 'Location Unavailable',
                    router,
                });

                resetState();
            } catch (error: any) {
                if (isCancelled.current) return;
                handleError(error);
            }
        },
        [handleError, resetState, router]
    );

    useEffect(() => {
        processImageRef.current = processImage;
    }, [processImage]);

    const processLabel = useCallback(
        async (uri: string, customTimestamp?: string | null) => {
            try {
                isCancelled.current = false;
                beginAnalysis({ uri, setIsAnalyzing, setCapturedImage, setActiveStep });

                if (!isConnectedRef.current) {
                    Alert.alert('오프라인', '인터넷 연결을 확인해주세요.');
                    resetState();
                    return;
                }

                const locationData = cachedLocation.current || (await getLocationData().catch(() => null));
                const isoCode = getIsoCode(locationData, 'US');

                setActiveStep(1);
                setUploadProgress(0);

                const analysisResult = await analyzeLabel(
                    uri,
                    isoCode,
                    createProgressHandler({ isCancelled, setUploadProgress, setActiveStep })
                );

                if (isCancelled.current) return;

                setActiveStep(3);
                await persistAndNavigateAnalysisResult({
                    analysisResult,
                    locationData,
                    isoCode,
                    timestamp: customTimestamp,
                    imageUri: uri,
                    router,
                });

                resetState();
            } catch (error: any) {
                if (isCancelled.current) return;
                handleError(error);
            }
        },
        [handleError, resetState, router]
    );

    const processSmart = useCallback(
        async (
            uri: string,
            customTimestamp?: string | null,
            customLocation?: any
        ) => {
            try {
                isCancelled.current = false;
                beginAnalysis({ uri, setIsAnalyzing, setCapturedImage, setActiveStep });

                let locationData = customLocation || cachedLocation.current;
                if (!locationData) {
                    try {
                        locationData = await getLocationData();
                        if (locationData) cachedLocation.current = locationData;
                    } catch (e) {
                        console.warn('Location fetch failed', e);
                    }
                }

                if (isCancelled.current) return;

                if (!isConnectedRef.current) {
                    Alert.alert('오프라인', '인터넷 연결을 확인해주세요.');
                    resetState();
                    return;
                }

                const isoCode = getIsoCode(locationData, 'US');
                await assertImageFileReady(uri);

                setActiveStep(1);
                setUploadProgress(0);

                const analysisResult = await analyzeSmart(
                    uri,
                    isoCode,
                    createProgressHandler({ isCancelled, setUploadProgress, setActiveStep })
                );

                if (isCancelled.current) return;

                setActiveStep(3);

                await persistAndNavigateAnalysisResult({
                    analysisResult,
                    locationData,
                    isoCode,
                    timestamp: customTimestamp,
                    imageUri: uri,
                    fallbackAddress: 'Location Unavailable',
                    router,
                });

                resetState();
            } catch (error: any) {
                if (isCancelled.current) return;
                handleError(error);
            }
        },
        [handleError, resetState, router]
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
