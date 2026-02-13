import { AnalysisRecord } from '../services/analysisService';

export type SafetyType = 'ok' | 'avoid' | 'ask';
export type CountryCoordinates = [number, number] | number[];

export interface RegionItem {
    id: string;
    name: string;
    type: SafetyType;
    date: string;
    emoji: string;
    originalRecord: AnalysisRecord;
}

export interface RegionData {
    name: string;
    items: RegionItem[];
}

export interface CountryData {
    country: string;
    flag: string;
    total: number;
    coordinates: CountryCoordinates;
    regions: RegionData[];
}
