import { Region } from 'react-native-maps';
import * as FileSystem from 'expo-file-system/legacy';
import { CountryData } from '@/models/History';
import { resolveImageUri } from '@/services/imageStorage';
import { CLUSTER_MAX_ZOOM, CLUSTER_MIN_ZOOM } from '../constants';
import { ENABLE_MAP_DEBUG_LOGS, ENABLE_QA_MAP_METRICS } from '../constants';
import { ClusterFeature, ClusterOrPoint, MapMarker, PointFeature } from '../types';

export const debugLog = (...args: unknown[]) => {
    if (ENABLE_MAP_DEBUG_LOGS) {
        console.log(...args);
    }
};

const TRACE_FILE_NAME = 'map_trace.txt';
const TRACE_DIR = FileSystem.cacheDirectory || '';
const TRACE_FILE_URI = TRACE_DIR ? `${TRACE_DIR}${TRACE_FILE_NAME}` : '';
const TRACE_EXPORT_URI = FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}${TRACE_FILE_NAME}`
    : '';
let traceFileInitialized = false;
let traceWriteQueue: Promise<void> = Promise.resolve();
let traceFlushScheduled = false;
let tracePathLogged = false;

const safeSerialize = (value: unknown) => {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const MAX_TRACE_LINES = 1000;
let traceLines: string[] = [`${new Date().toLocaleString()} --- LOG INITIALIZED (APP START) ---`];

const initializeTraceFile = async () => {
    try {
        await FileSystem.writeAsStringAsync(TRACE_FILE_URI, traceLines.join('\n') + '\n', {
            encoding: FileSystem.EncodingType.UTF8,
        });
        if (TRACE_EXPORT_URI) {
            await FileSystem.writeAsStringAsync(TRACE_EXPORT_URI, traceLines.join('\n') + '\n', {
                encoding: FileSystem.EncodingType.UTF8,
            });
        }
        traceFileInitialized = true;
    } catch (e) {
        // Fallback or ignore if path is strictly forbidden by sandbox
        console.error('[MapTrace] Initialization failed', e);
    }
};
void initializeTraceFile();

const appendHistoryMapTraceFile = (level: 'LOG' | 'WARN', args: unknown[]) => {
    if (!TRACE_FILE_URI) return;
    if (!tracePathLogged) {
        tracePathLogged = true;
        console.log('[HistoryMapTrace] trace-file-uri', TRACE_FILE_URI);
        if (TRACE_EXPORT_URI) {
            console.log('[HistoryMapTrace] trace-export-uri', TRACE_EXPORT_URI);
        }
    }
    const line = `${new Date().toLocaleTimeString()} [${level}] ${args.map(safeSerialize).join(' ')}`;
    traceLines.push(line);
    
    if (traceLines.length > MAX_TRACE_LINES) {
        traceLines = traceLines.slice(-MAX_TRACE_LINES);
    }

    if (traceFlushScheduled) return;
    traceFlushScheduled = true;
    setTimeout(() => {
        traceFlushScheduled = false;
        const snapshot = traceLines.join('\n');
        
        traceWriteQueue = traceWriteQueue
            .then(async () => {
                try {
                    await FileSystem.writeAsStringAsync(TRACE_FILE_URI, snapshot, {
                        encoding: FileSystem.EncodingType.UTF8,
                    });
                    if (TRACE_EXPORT_URI) {
                        await FileSystem.writeAsStringAsync(TRACE_EXPORT_URI, snapshot, {
                            encoding: FileSystem.EncodingType.UTF8,
                        });
                    }
                } catch (e) {
                    console.error('[MapFileLogger] Write failed', e);
                }
            })
            .catch(() => {});
    }, 200); // 200ms flush interval to capture data as close to a crash as possible
};

export const getHistoryMapTraceFileUri = () => TRACE_FILE_URI;
export const getHistoryMapTraceExportUri = () => TRACE_EXPORT_URI;

export const mapTraceLog = (...args: unknown[]) => {
    console.log('[HistoryMapTrace]', ...args);
    appendHistoryMapTraceFile('LOG', args);
};

export const mapTraceWarn = (...args: unknown[]) => {
    console.warn('[HistoryMapTrace]', ...args);
    appendHistoryMapTraceFile('WARN', args);
};

export const metricsLog = (...args: unknown[]) => {
    if (ENABLE_QA_MAP_METRICS && __DEV__) {
        console.log(...args);
    }
};

export const isClusterFeature = (item: ClusterOrPoint): item is ClusterFeature =>
    (item as ClusterFeature).properties.cluster === true;

export const parseCoordinateValue = (value: number | string | undefined): number | undefined => {
    const numeric = typeof value === 'string' ? Number(value) : value;
    if (numeric === undefined || !Number.isFinite(numeric)) return undefined;
    return numeric;
};

export const isValidLatitude = (value: number) => Number.isFinite(value) && value >= -90 && value <= 90;
export const isValidLongitude = (value: number) => Number.isFinite(value) && value >= -180 && value <= 180;
export const isValidDelta = (value: number) => Number.isFinite(value) && value > 0 && value <= 360;

export const buildRegionKey = (region: Region) =>
    `${region.latitude.toFixed(3)}:${region.longitude.toFixed(3)}:${region.latitudeDelta.toFixed(3)}:${region.longitudeDelta.toFixed(3)}`;

export const toBoundingBox = (region: Region): [number, number, number, number] => {
    const lngDelta = region.longitudeDelta < 0 ? region.longitudeDelta + 360 : region.longitudeDelta;
    return [
        region.longitude - lngDelta,
        region.latitude - region.latitudeDelta,
        region.longitude + lngDelta,
        region.latitude + region.latitudeDelta,
    ];
};

export const toApproxZoom = (region: Region): number => {
    if (!Number.isFinite(region.longitudeDelta) || region.longitudeDelta <= 0) return CLUSTER_MIN_ZOOM;
    const zoom = Math.log2(360 / region.longitudeDelta);
    return Math.max(CLUSTER_MIN_ZOOM, Math.min(CLUSTER_MAX_ZOOM, Math.floor(zoom)));
};

type HistoryMapSourceItem = CountryData['regions'][number]['items'][number] & {
    imageUri?: string;
    originalRecord?: {
        location?: {
            latitude?: number | string;
            longitude?: number | string;
        };
    };
};

export const flattenMarkers = (data: CountryData[]): MapMarker[] => {
    const markers: MapMarker[] = [];

    data.forEach((country, countryIdx) => {
        (country?.regions || []).forEach((region) => {
            (region?.items || []).forEach((rawItem) => {
                const item = rawItem as HistoryMapSourceItem;
                const loc = item.originalRecord?.location;
                const lat = parseCoordinateValue(loc?.latitude);
                const lng = parseCoordinateValue(loc?.longitude);

                if (lat === undefined || lng === undefined) return;
                if (!isValidLatitude(lat) || !isValidLongitude(lng)) return;

                if (lat === 0 && lng === 0) return;

                markers.push({
                    id: item.id,
                    coordinate: { latitude: lat, longitude: lng },
                    countryId: `${country.country}-${countryIdx}`,
                    emoji: item.emoji,
                    name: item.name,
                    imageUri: item.imageUri ? resolveImageUri(item.imageUri) || undefined : undefined,
                });
            });
        });
    });

    return markers;
};

export const toMarkerFeatures = (markers: MapMarker[]): PointFeature[] =>
    markers.map((marker, markerIndex) => ({
        type: 'Feature',
        properties: { markerIndex },
        geometry: {
            type: 'Point',
            coordinates: [marker.coordinate.longitude, marker.coordinate.latitude],
        },
    }));

export const getFavoriteCountry = (data: CountryData[]): string =>
    [...data].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0]?.country || '-';

export const getVisitedPercentage = (visitedCount: number, totalCountries: number): number =>
    Math.min((visitedCount / totalCountries) * 100, 100);
