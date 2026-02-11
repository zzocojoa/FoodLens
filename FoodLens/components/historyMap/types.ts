import { Region } from 'react-native-maps';
import { CountryData } from '@/models/History';

export interface HistoryMapProps {
    data: CountryData[];
    initialRegion: Region | null;
    onMarkerPress: (countryId: string) => void;
    onReady?: () => void;
    onRegionChange?: (region: Region) => void;
}

export type MapMarker = {
    id: string;
    coordinate: { latitude: number; longitude: number };
    countryId: string;
    emoji: string;
    name: string;
    imageUri?: string;
};

export type PointFeature = {
    type: 'Feature';
    geometry: {
        type: 'Point';
        coordinates: [number, number];
    };
    properties: {
        markerIndex: number;
    };
};

export type ClusterFeature = {
    type: 'Feature';
    geometry: {
        type: 'Point';
        coordinates: [number, number];
    };
    properties: {
        cluster: true;
        cluster_id: number;
        point_count: number;
        point_count_abbreviated: string | number;
    };
};

export type ClusterOrPoint = ClusterFeature | PointFeature;
