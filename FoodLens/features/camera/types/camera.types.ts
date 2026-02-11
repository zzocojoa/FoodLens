import { PermissionResponse } from 'expo-image-picker';

export type CameraSourceType = 'camera' | 'library';

export type CameraRouteParams = {
    imageUri?: string;
    photoLat?: string;
    photoLng?: string;
    photoTimestamp?: string;
    sourceType?: CameraSourceType;
};

export type LocationContext = {
    latitude: number;
    longitude: number;
    country: string | null;
    city: string | null;
    district: string;
    subregion: string;
    isoCountryCode?: string;
    formattedAddress: string;
};

export type CameraGatewayState = {
    permission: PermissionResponse | null;
    externalImageUri?: string;
    isLocationReady: boolean;
    capturedImage: string | null;
    activeStep?: number;
    uploadProgress?: number;
    requestPermission: () => Promise<PermissionResponse>;
    handleCancelAnalysis: () => void;
};

