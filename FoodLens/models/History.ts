import { AnalysisRecord } from '../services/analysisService';

export interface RegionData {
    name: string;
    items: {
        id: string; 
        name: string;
        type: 'safe' | 'danger' | 'caution';
        date: string;
        emoji: string;
        originalRecord: AnalysisRecord;
    }[];
}

export interface CountryData {
    country: string;
    flag: string;
    total: number;
    coordinates: number[];
    regions: RegionData[];
}
