import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    CameraView,
    CameraType,
    FlashMode,
    useCameraPermissions,
} from 'expo-camera';
import { useAppNavigation } from '../../../hooks/use-app-navigation';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { analyzeImage, analyzeLabel, analyzeSmart } from '../../../services/ai';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { MODES } from '../constants/scanCamera.constants';
import { CameraMode } from '../types/scanCamera.types';
import { useScanCameraLaserAnimation } from './useScanCameraLaserAnimation';
import { runAnalysisFlow } from '../services/scanCameraAnalysisService';
import { useI18n } from '@/features/i18n';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { LocationData } from '@/services/utils/types';
import { useScanPermissionFlow } from './useScanPermissionFlow';
import { useScanBarcodeFlow } from './useScanBarcodeFlow';
import { useScanCaptureFlow } from './useScanCaptureFlow';
import { useScanGalleryFlow } from './useScanGalleryFlow';

export const useScanCameraGateway = () => {
    const { t } = useI18n();
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
    const cachedLocation = useRef<LocationData | null | undefined>(undefined);

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
        (error: unknown) => {
            console.error(error);
            resetState();

            const errorMessage =
                error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
            if (errorMessage.includes('status 5') || errorMessage.includes('status 500')) {
                showTranslatedAlert(t, {
                    titleKey: 'camera.alert.serverErrorTitle',
                    titleFallback: 'Server Error',
                    messageKey: 'scan.alert.serverTemporary',
                    messageFallback: 'A temporary server issue occurred.',
                });
            } else {
                showTranslatedAlert(t, {
                    titleKey: 'camera.alert.analysisFailedTitle',
                    titleFallback: 'Analysis Failed',
                    messageKey: 'scan.alert.analysisFailed',
                    messageFallback: 'Something went wrong. Please try again.',
                });
            }
        },
        [resetState, t]
    );

    const runFlow = useCallback(
        async (params: {
            uri: string;
            sourceType?: 'camera' | 'library';
            timestamp?: string | null;
            customLocation?: LocationData | null;
            fallbackAddress?: string;
            needsFileValidation: boolean;
            analyzer: typeof analyzeImage;
        }) => {
            await runAnalysisFlow({
                uri: params.uri,
                sourceType: params.sourceType,
                timestamp: params.timestamp,
                customLocation: params.customLocation,
                fallbackAddress: params.fallbackAddress,
                offlineAlertTitle: t('camera.alert.offlineTitle', 'Offline'),
                offlineAlertMessage: t('camera.error.offline', 'Please check your internet connection.'),
                needsFileValidation: params.needsFileValidation,
                analyzer: params.analyzer,
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
        [handleError, resetState, replace, t]
    );

    const processImage = useCallback(
        async (
            uri: string,
            customSourceType: 'camera' | 'library' = 'camera',
            customTimestamp?: string | null,
            customLocation?: LocationData | null
        ) => {
            await runFlow({
                uri,
                sourceType: customSourceType,
                timestamp: customTimestamp,
                customLocation,
                fallbackAddress: 'Location Unavailable',
                needsFileValidation: true,
                analyzer: analyzeImage,
            });
        },
        [runFlow]
    );

    const processLabel = useCallback(
        async (uri: string, customTimestamp?: string | null) => {
            await runFlow({
                uri,
                sourceType: 'camera',
                timestamp: customTimestamp,
                fallbackAddress: 'Location Unavailable',
                needsFileValidation: true,
                analyzer: analyzeLabel,
            });
        },
        [runFlow]
    );

    const processSmart = useCallback(
        async (
            uri: string,
            customTimestamp?: string | null,
            customLocation?: LocationData | null
        ) => {
            await runFlow({
                uri,
                sourceType: 'library',
                timestamp: customTimestamp,
                customLocation,
                fallbackAddress: 'Location Unavailable',
                needsFileValidation: true,
                analyzer: analyzeSmart,
            });
        },
        [runFlow]
    );



    const requestCameraPermission = useScanPermissionFlow({ requestPermission, t });
    const { handleBarcodeScanned } = useScanBarcodeFlow({
        mode,
        scanned,
        isAnalyzing,
        isConnectedRef,
        isProcessingRef,
        cachedLocation,
        resetState,
        replace,
        setScanned,
        setIsAnalyzing,
        setActiveStep,
        setMode,
        t,
    });
    const handleCapture = useScanCaptureFlow({
        cameraRef,
        mode,
        processImage,
        processLabel,
        t,
    });
    const handleGallery = useScanGalleryFlow({
        processSmart,
        t,
    });

    return {
        cameraRef,
        isFocused,
        permission,
        requestPermission: requestCameraPermission,
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
