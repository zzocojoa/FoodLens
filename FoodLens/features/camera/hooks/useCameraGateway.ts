import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { analyzeImage } from '../../../services/ai';
import { dataStore } from '../../../services/dataStore';
import { getLocationData, normalizeTimestamp, validateCoordinates } from '../../../services/utils';
import { UserService } from '../../../services/userService';
import { CAMERA_ERROR_MESSAGES, DEFAULT_ISO_CODE, TEST_UID } from '../constants/camera.constants';
import { CameraGatewayState, CameraRouteParams, LocationContext } from '../types/camera.types';
import { createFallbackLocation, isFileError, isRetryableServerError } from '../utils/cameraMappers';

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

                let isoCode = locationData?.isoCountryCode;
                if (!isoCode) {
                    try {
                        const user = await UserService.getUserProfile(TEST_UID);
                        if (user && user.settings.targetLanguage) {
                            isoCode = user.settings.targetLanguage;
                        }
                    } catch (e) {
                        console.warn('Failed to load user preference for language fallback', e);
                    }
                }

                isoCode = isoCode || DEFAULT_ISO_CODE;

                const fileInfo = await FileSystem.getInfoAsync(uri);
                if (!fileInfo.exists || (fileInfo as any).size === 0) {
                    throw new Error('File validation failed: Image is empty or missing.');
                }

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
            if (photoLat && photoLng) {
                const validCoords = validateCoordinates(photoLat, photoLng);

                if (validCoords) {
                    const { latitude: lat, longitude: lng } = validCoords;
                    const fallbackLocation = createFallbackLocation(lat, lng);

                    try {
                        const reverseGeocode = await Location.reverseGeocodeAsync({
                            latitude: lat,
                            longitude: lng,
                        });

                        if (reverseGeocode.length > 0) {
                            const place = reverseGeocode[0];
                            const country = place.country || 'Unknown';
                            const city = place.city || place.region || 'Unknown';
                            const district = place.district || place.subregion || '';
                            const subregion = place.name || place.street || '';

                            const addressParts = [subregion, district, city, country];
                            const uniqueParts = Array.from(
                                new Set(addressParts.filter((part) => part && part !== 'Unknown'))
                            );
                            const formattedAddress = uniqueParts.join(', ');

                            cachedLocation.current = {
                                ...fallbackLocation,
                                country,
                                city,
                                district,
                                subregion,
                                isoCountryCode: place.isoCountryCode || undefined,
                                formattedAddress,
                            };
                        } else {
                            cachedLocation.current = fallbackLocation;
                        }
                    } catch (e) {
                        console.warn('Reverse geocode for photo failed', e);
                        cachedLocation.current = fallbackLocation;
                    }
                } else {
                    console.warn('Invalid EXIF coordinates provided:', photoLat, photoLng);
                }
            } else if (sourceType === 'camera') {
                const data = await getLocationData();
                if (data) {
                    cachedLocation.current = data;
                } else {
                    setTimeout(() => {
                        Alert.alert('위치 정보 없음', CAMERA_ERROR_MESSAGES.locationUnavailable);
                    }, 500);
                }
            } else {
                cachedLocation.current = null;
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

