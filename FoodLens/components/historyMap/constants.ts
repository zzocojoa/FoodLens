import { Platform } from 'react-native';
import { Region } from 'react-native-maps';

export const ENABLE_MAP_DEBUG_LOGS = false;
export const ENABLE_MAP_CLUSTERING = false;
export const ENABLE_QA_MAP_METRICS = false;

export const IOS_REGION_UPDATE_DEBOUNCE_MS = 350;
export const ANDROID_REGION_UPDATE_DEBOUNCE_MS = 250;

export const MAX_RENDER_MARKERS = 500;
export const CLUSTER_RADIUS = 60;
export const CLUSTER_MAX_ZOOM = 20;
export const CLUSTER_MIN_ZOOM = 1;

export const REGION_UPDATE_DEBOUNCE_MS =
    Platform.OS === 'ios' ? IOS_REGION_UPDATE_DEBOUNCE_MS : ANDROID_REGION_UPDATE_DEBOUNCE_MS;

export const TOTAL_COUNTRIES = 195;

export const INITIAL_REGION: Region = {
    latitude: 20,
    longitude: 0,
    latitudeDelta: 50,
    longitudeDelta: 50,
};
