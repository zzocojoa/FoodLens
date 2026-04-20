import type { CountryData } from '../../../models/History';
import type { AnalysisRecord } from '../../../services/analysisService';

export type HistoryTone = 'ok' | 'ask' | 'avoid';

export interface HistoryToneCounts {
  safe: number;
  caution: number;
  danger: number;
}

export interface HistoryJournalSummary {
  totalCount: number;
  countryCount: number;
  cityCount: number;
  toneCounts: HistoryToneCounts;
  latestRecordAt: Date | null;
  latestCountryLabel: string | null;
  latestCityLabel: string | null;
}

export interface HistoryCountryChapter {
  id: string;
  country: string;
  flag: string;
  totalCount: number;
  cityCount: number;
  toneCounts: HistoryToneCounts;
  latestRecordAt: Date | null;
  latestCityLabel: string | null;
  latestRecordId: string | null;
  countryData: CountryData;
}

export interface HistoryRecentEntry {
  id: string;
  tone: HistoryTone;
  countryLabel: string;
  cityLabel: string;
  foodName: string;
  emoji: string;
  timestamp: Date;
  imageUri?: string;
  countryCode: string | null;
  record: AnalysisRecord;
}

export interface HistoryAtlasSummary {
  totalCount: number;
  countryCount: number;
  cityCount: number;
  toneCounts: HistoryToneCounts;
  latestRecordAt: Date | null;
  latestCountryLabel: string | null;
  latestCityLabel: string | null;
  countriesWithLocationCount: number;
}

export interface HistoryArchiveViewModel {
  journalSummary: HistoryJournalSummary;
  countryChapters: HistoryCountryChapter[];
  recentEntries: HistoryRecentEntry[];
  atlasSummary: HistoryAtlasSummary;
}
