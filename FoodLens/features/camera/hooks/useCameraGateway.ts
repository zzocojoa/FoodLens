import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { getCameraErrorMessages } from '../constants/camera.constants';
import { CameraGatewayState, CameraRouteParams, LocationContext } from '../types/camera.types';
import { runCameraImageAnalysis } from '../services/cameraAnalysisService';
import { useCameraPermissionEffects } from './useCameraPermissionEffects';
import { useCameraGatewayInitialization } from './useCameraGatewayInitialization';
import { useI18n } from '@/features/i18n';
import { useCameraGatewayErrorHandler } from './useCameraGatewayErrorHandler';

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
    const { t } = useI18n();
    const messages = getCameraErrorMessages(t);

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

    const handleError = useCameraGatewayErrorHandler({
        t,
        messages,
        onExit,
        resetState,
        processImageRef,
    });

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
                    offlineAlertTitle: t('camera.alert.offlineTitle', 'Offline'),
                    offlineAlertMessage: messages.offline,
                });
            } catch (error) {
                if (isCancelled.current) return;
                handleError(error, uri);
            }
        },
        [handleError, onExit, onSuccess, photoTimestamp, resetState, t, messages.offline]
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
