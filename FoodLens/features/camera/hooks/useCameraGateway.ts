import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { analyzeImage } from '../../../services/ai';
import { dataStore } from '../../../services/dataStore';
import { getLocationData, normalizeTimestamp } from '../../../services/utils';
import { CAMERA_ERROR_MESSAGES } from '../constants/camera.constants';
import { CameraGatewayState, CameraRouteParams, LocationContext } from '../types/camera.types';
import { createFallbackLocation, isFileError, isRetryableServerError } from '../utils/cameraMappers';
import {
    assertImageFileReady,
    resolveInitialLocationContext,
    resolveIsoCodeFromContext,
} from '../utils/cameraGatewayHelpers';

type UseCameraGatewayOptions = {
    params: CameraRouteParams;
    isConnected: boolean;
    onExit: () => void;
    onSuccess: () => void;
};

export const useCameraGateway = ({
    params,
    isConnected,
    onExit,
    onSuccess,
}: UseCameraGatewayOptions): CameraGatewayState => {
    const [permission, requestPermission] = ImagePicker.useCameraPermissions();
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [isLocationReady, setIsLocationReady] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined);
    const [activeStep, setActiveStep] = useState<number | undefined>(undefined);

    const isCancelled = useRef(false);
    const isConnectedRef = useRef(true);
    const cachedLocation = useRef<LocationContext | null | undefined>(undefined);
    const processImageRef = useRef<(uri: string) => Promise<void>>(async () => {});

    const { imageUri: externalImageUri, photoLat, photoLng, photoTimestamp, sourceType } = params;

    useEffect(() => {
        isConnectedRef.current = isConnected;
    }, [isConnected]);

    useEffect(() => {
        if (permission && !permission.granted && permission.canAskAgain) {
            requestPermission();
        }
    }, [permission, requestPermission]);

    useEffect(() => {
        if (permission?.granted && !externalImageUri) {
            const timer = setTimeout(() => {
                Alert.alert('오류', CAMERA_ERROR_MESSAGES.missingImage);
                onExit();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [permission, externalImageUri, onExit]);

    const resetState = useCallback(() => {
        setIsAnalyzing(false);
        setCapturedImage(null);
        setUploadProgress(undefined);
        setActiveStep(undefined);
    }, []);

    const handleCancelAnalysis = useCallback(() => {
        isCancelled.current = true;
        resetState();
        onExit();
    }, [onExit, resetState]);

    const handleError = useCallback(
        (error: any, uri: string) => {
            console.error(error);
            resetState();

            const errorMessage = error?.message?.toLowerCase() || '';

            if (isRetryableServerError(errorMessage)) {
                Alert.alert('서버 오류', '일시적인 서버 문제가 발생했습니다.\n다시 시도하시겠습니까?', [
                    { text: '취소', style: 'cancel', onPress: () => onExit() },
                    {
                        text: '재시도',
                        onPress: () => {
                            if (uri) {
                                processImageRef.current(uri);
                            }
                        },
                    },
                ]);
                return;
            }

            if (isFileError(errorMessage)) {
                Alert.alert('파일 오류', CAMERA_ERROR_MESSAGES.file);
            } else {
                Alert.alert('분석 실패', CAMERA_ERROR_MESSAGES.analysis);
            }

            onExit();
        },
        [onExit, resetState]
    );

    const processImage = useCallback(
        async (uri: string) => {
            try {
                isCancelled.current = false;
                setIsAnalyzing(true);
                setCapturedImage(uri);
                setActiveStep(0);

                let locationData = cachedLocation.current;

                if (locationData === undefined) {
                    try {
                        locationData = await getLocationData();
                    } catch (e) {
                        console.warn('Location fetch failed, defaulting to US context', e);
                    }
                }

                if (isCancelled.current) return;

                if (!isConnectedRef.current) {
                    Alert.alert('오프라인', CAMERA_ERROR_MESSAGES.offline);
                    resetState();
                    onExit();
                    return;
                }

                const isoCode = await resolveIsoCodeFromContext(locationData);
                await assertImageFileReady(uri);

                setActiveStep(1);
                setUploadProgress(0);

                const analysisResult = await analyzeImage(uri, isoCode, (progress) => {
                    if (!isCancelled.current) {
                        setUploadProgress(progress);
                        if (progress >= 1) {
                            setActiveStep(2);
                        }
                    }
                });

                if (isCancelled.current) return;

                setActiveStep(3);

                const locationContext =
                    locationData ||
                    createFallbackLocation(0, 0, isoCode, 'Location Unavailable (Using Preference)');
                const finalTimestamp = normalizeTimestamp(photoTimestamp);

                dataStore.setData(analysisResult, locationContext, uri, finalTimestamp);
                onSuccess();
                resetState();
            } catch (error: any) {
                if (isCancelled.current) return;
                handleError(error, uri);
            }
        },
        [handleError, onExit, onSuccess, photoTimestamp, resetState]
    );

    useEffect(() => {
        processImageRef.current = processImage;
    }, [processImage]);

    useEffect(() => {
        const initLocation = async () => {
            const resolvedLocation = await resolveInitialLocationContext({
                photoLat,
                photoLng,
                sourceType,
            });
            cachedLocation.current = resolvedLocation;

            if (!resolvedLocation && sourceType === 'camera') {
                setTimeout(() => {
                    Alert.alert('위치 정보 없음', CAMERA_ERROR_MESSAGES.locationUnavailable);
                }, 500);
            }

            setIsLocationReady(true);

            if (externalImageUri) {
                processImage(externalImageUri);
            }
        };

        initLocation();
    }, [externalImageUri, photoLat, photoLng, processImage, sourceType]);

    return {
        permission,
        requestPermission,
        externalImageUri,
        isLocationReady,
        capturedImage,
        activeStep,
        uploadProgress,
        handleCancelAnalysis,
    };
};
