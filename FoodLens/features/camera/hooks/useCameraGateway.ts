import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CAMERA_ERROR_MESSAGES } from '../constants/camera.constants';
import { CameraGatewayState, CameraRouteParams, LocationContext } from '../types/camera.types';
import { isFileError, isRetryableServerError } from '../utils/cameraMappers';
import { runCameraImageAnalysis } from '../services/cameraAnalysisService';
import { useCameraPermissionEffects } from './useCameraPermissionEffects';
import { useCameraGatewayInitialization } from './useCameraGatewayInitialization';

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

    useCameraPermissionEffects({
        permission,
        requestPermission,
        externalImageUri,
        onExit,
    });

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
                await runCameraImageAnalysis({
                    uri,
                    photoTimestamp,
                    cachedLocation,
                    isCancelled,
                    isConnectedRef,
                    setIsAnalyzing,
                    setCapturedImage,
                    setActiveStep,
                    setUploadProgress,
                    resetState,
                    onExit,
                    onSuccess,
                });
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

    useCameraGatewayInitialization({
        photoLat,
        photoLng,
        sourceType,
        externalImageUri,
        processImage,
        cachedLocation,
        setIsLocationReady,
    });

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
