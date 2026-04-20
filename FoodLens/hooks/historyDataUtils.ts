import { CountryData } from '../models/History';
import { AnalysisRecord } from '../services/analysisService';
import { getBarcodeImageUri, resolveImageUri } from '../services/imageStorage';
import { getEmoji } from '../services/utils';
import { getLocalizedFoodName } from '../features/home/utils/localizedFoodName';
import type {
  HistoryArchiveViewModel,
  HistoryAtlasSummary,
  HistoryCountryChapter,
  HistoryJournalSummary,
  HistoryRecentEntry,
  HistoryToneCounts,
  HistoryTone,
} from '../features/history/types/historyViewModel.types';
export { flattenHistoryData } from './historyDataFlatten';
export type { FlattenedHistoryItem } from './historyDataFlatten';

type SafetyType = 'ok' | 'avoid' | 'ask';
type TranslateFn = (key: string, fallback?: string) => string;
type LanguageType = 'en' | 'ko';

const toSafetyType = (safetyStatus?: string): SafetyType => {
  const normalized = safetyStatus?.toUpperCase() || '';
  if (normalized === 'SAFE') return 'ok';
  if (normalized === 'DANGER' || normalized === 'WARNING') return 'avoid';
  return 'ask';
};

const toFlagEmoji = (isoCountryCode?: string): string => {
  if (!isoCountryCode) return '📁';
  return isoCountryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(char.charCodeAt(0) + 127397));
};

const toLocaleTag = (locale?: string): string => {
  if (!locale || locale === 'auto') return 'en-US';
  if (locale.length === 2) return `${locale.toLowerCase()}-${locale.toUpperCase()}`;
  return locale;
};

const toLanguageType = (locale?: string): LanguageType =>
  (toLocaleTag(locale).split('-')[0] || '').toLowerCase() === 'ko' ? 'ko' : 'en';

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  '대한민국': 'KR',
  '한국': 'KR',
  '남한': 'KR',
  'korea': 'KR',
  'south korea': 'KR',
  'republic of korea': 'KR',
  '일본': 'JP',
  '일본국': 'JP',
  'japan': 'JP',
  'nippon': 'JP',
  '미국': 'US',
  '미합중국': 'US',
  'united states': 'US',
  'united states of america': 'US',
  'usa': 'US',
  '중국': 'CN',
  'china': 'CN',
  '베트남': 'VN',
  'vietnam': 'VN',
  '태국': 'TH',
  'thailand': 'TH',
};

const ISO_COUNTRY_LABELS: Record<'en' | 'ko', Record<string, string>> = {
  en: {
    KR: 'South Korea',
    JP: 'Japan',
    US: 'United States',
    CN: 'China',
    TH: 'Thailand',
    VN: 'Vietnam',
  },
  ko: {
    KR: '대한민국',
    JP: '일본',
    US: '미국',
    CN: '중국',
    TH: '태국',
    VN: '베트남',
  },
};

const CITY_OVERRIDES_EN: Record<string, string> = {
  '대구': 'Daegu',
  '대구광역시': 'Daegu',
  '유후시': 'Yufu',
  '유후': 'Yufu',
  '서울': 'Seoul',
  '서울특별시': 'Seoul',
  '부산': 'Busan',
  '부산광역시': 'Busan',
  '도쿄': 'Tokyo',
  '오사카': 'Osaka',
  '후쿠오카': 'Fukuoka',
};

const normalizeCountryNameKey = (value?: string): string =>
  (value || '')
    .trim()
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ');

const toEffectiveIsoCountryCode = (
  location?: NonNullable<AnalysisRecord['location']>
): string | undefined => {
  if (!location) return undefined;
  const iso = (location.isoCountryCode || '').trim().toUpperCase();
  if (iso) return iso;
  const byName = COUNTRY_NAME_TO_ISO[normalizeCountryNameKey(location.country)];
  return byName || undefined;
};

const toLocalizedCountryName = (
  isoCountryCode?: string,
  fallbackCountry?: string,
  locale?: string
): string | undefined => {
  const iso = (isoCountryCode || '').trim().toUpperCase();
  if (!iso) return fallbackCountry;
  const language = toLanguageType(locale);
  const mapped = ISO_COUNTRY_LABELS[language][iso];
  if (mapped) return mapped;
  try {
    const display = new Intl.DisplayNames([toLocaleTag(locale)], { type: 'region' });
    return display.of(iso) || fallbackCountry;
  } catch {
    return fallbackCountry || mapped || iso;
  }
};

const toLocalizedCityName = (
  location: NonNullable<AnalysisRecord['location']>,
  locale?: string
): string | undefined => {
  const language = toLanguageType(locale);
  const anyLoc = location as Record<string, unknown>;
  const preferredKeys =
    language === 'ko'
      ? ['city_ko', 'cityKo', 'district_ko', 'districtKo', 'subregion_ko', 'subregionKo']
      : ['city_en', 'cityEn', 'district_en', 'districtEn', 'subregion_en', 'subregionEn'];
  for (const key of preferredKeys) {
    const value = anyLoc[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  const raw = location.city || location.formattedAddress;
  if (!raw) return undefined;
  if (language === 'en') return CITY_OVERRIDES_EN[raw] || raw;
  return raw;
};

const hasValidLocation = (record: AnalysisRecord): boolean =>
  !!record.location &&
  !!record.location.latitude &&
  !!record.location.longitude &&
  (record.location.latitude !== 0 || record.location.longitude !== 0);

const INITIAL_REGION_MIN_DELTA = 0.6;
const INITIAL_REGION_PADDING_MULTIPLIER = 1.6;
const INITIAL_REGION_MAX_LATITUDE_DELTA = 180;
const INITIAL_REGION_MAX_LONGITUDE_DELTA = 360;

const sortRecordsByTimestampDesc = (records: AnalysisRecord[]): AnalysisRecord[] =>
  [...records].sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());

const createEmptyToneCounts = (): HistoryToneCounts => ({
  safe: 0,
  caution: 0,
  danger: 0,
});

const toHistoryTone = (safetyStatus?: string): HistoryTone => {
  const normalized = safetyStatus?.toUpperCase() || '';
  if (normalized === 'SAFE') return 'ok';
  if (normalized === 'DANGER' || normalized === 'WARNING') return 'avoid';
  return 'ask';
};

const buildToneCountsFromRecords = (records: AnalysisRecord[]): HistoryToneCounts => {
  const counts = createEmptyToneCounts();
  records.forEach((record) => {
    const tone = toHistoryTone(record.safetyStatus);
    if (tone === 'ok') {
      counts.safe += 1;
      return;
    }

    if (tone === 'avoid') {
      counts.danger += 1;
      return;
    }

    counts.caution += 1;
  });
  return counts;
};

const buildToneCountsFromCountry = (country: CountryData): HistoryToneCounts => {
  const counts = createEmptyToneCounts();
  country.regions.forEach((region) => {
    region.items.forEach((item) => {
      if (item.type === 'ok') {
        counts.safe += 1;
        return;
      }

      if (item.type === 'avoid') {
        counts.danger += 1;
        return;
      }

      counts.caution += 1;
    });
  });
  return counts;
};

const findLatestItem = (country: CountryData) => {
  let latestItem = null as CountryData['regions'][number]['items'][number] | null;
  let latestCity = null as string | null;

  country.regions.forEach((region) => {
    region.items.forEach((item) => {
      if (!latestItem || item.timestamp.getTime() > latestItem.timestamp.getTime()) {
        latestItem = item;
        latestCity = region.name;
      }
    });
  });

  return {
    latestItem,
    latestCity,
  };
};

const buildHistoryCountryChapters = (
  archiveData: CountryData[]
): HistoryCountryChapter[] =>
  archiveData.map((country) => {
    const toneCounts = buildToneCountsFromCountry(country);
    const latest = findLatestItem(country);

    return {
      id: country.country,
      country: country.country,
      flag: country.flag,
      totalCount: country.total,
      cityCount: country.regions.length,
      toneCounts,
      latestRecordAt: latest.latestItem?.timestamp || null,
      latestCityLabel: latest.latestCity,
      latestRecordId: latest.latestItem?.id || null,
      countryData: country,
    };
  });

const buildRecentEntries = (
  records: AnalysisRecord[],
  locale?: string,
  t?: TranslateFn
): HistoryRecentEntry[] =>
  sortRecordsByTimestampDesc(records).map((record) => {
    const localizedFoodName = getLocalizedFoodName(record, locale);
    const { country, city, effectiveIso } = toCountryAndCity(record, locale, t);

    return {
      id: record.id,
      tone: toHistoryTone(record.safetyStatus),
      countryLabel: country,
      cityLabel: city,
      foodName: localizedFoodName,
      emoji: getEmoji(localizedFoodName),
      timestamp: record.timestamp,
      imageUri: record.isBarcode ? getBarcodeImageUri() : (resolveImageUri(record.imageUri) || undefined),
      countryCode: effectiveIso || null,
      record,
    };
  });

const buildHistoryJournalSummary = (
  records: AnalysisRecord[],
  archiveData: CountryData[],
  locale?: string,
  t?: TranslateFn
): HistoryJournalSummary => {
  const sortedRecords = sortRecordsByTimestampDesc(records);
  const latestRecord = sortedRecords[0] || null;
  const latestLocation = latestRecord ? toCountryAndCity(latestRecord, locale, t) : null;

  return {
    totalCount: sortedRecords.length,
    countryCount: archiveData.length,
    cityCount: archiveData.reduce((sum, country) => sum + country.regions.length, 0),
    toneCounts: buildToneCountsFromRecords(sortedRecords),
    latestRecordAt: latestRecord?.timestamp || null,
    latestCountryLabel: latestLocation?.country || null,
    latestCityLabel: latestLocation?.city || null,
  };
};

const buildHistoryAtlasSummary = (
  records: AnalysisRecord[],
  archiveData: CountryData[],
  locale?: string,
  t?: TranslateFn
): HistoryAtlasSummary => {
  const journalSummary = buildHistoryJournalSummary(records, archiveData, locale, t);
  const locationCountries = new Set<string>();

  records.forEach((record) => {
    const location = toCountryAndCity(record, locale, t);
    if (!location.hasLocation) return;
    locationCountries.add(location.country);
  });

  return {
    ...journalSummary,
    countriesWithLocationCount: locationCountries.size,
  };
};

export const buildHistoryArchiveViewModel = (
  records: AnalysisRecord[],
  archiveData: CountryData[],
  locale?: string,
  t?: TranslateFn
): HistoryArchiveViewModel => ({
  journalSummary: buildHistoryJournalSummary(records, archiveData, locale, t),
  countryChapters: buildHistoryCountryChapters(archiveData),
  recentEntries: buildRecentEntries(records, locale, t),
  atlasSummary: buildHistoryAtlasSummary(records, archiveData, locale, t),
});

export const buildInitialRegion = (records: AnalysisRecord[]) => {
  const validLocations = records
    .filter(hasValidLocation)
    .map((record) => ({
      latitude: record.location!.latitude,
      longitude: record.location!.longitude,
    }));

  if (validLocations.length === 0) {
    return null;
  }

  const latitudes = validLocations.map((location) => location.latitude);
  const longitudes = validLocations.map((location) => location.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = maxLatitude - minLatitude;
  const longitudeSpan = maxLongitude - minLongitude;

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.min(
      Math.max(latitudeSpan * INITIAL_REGION_PADDING_MULTIPLIER, INITIAL_REGION_MIN_DELTA),
      INITIAL_REGION_MAX_LATITUDE_DELTA
    ),
    longitudeDelta: Math.min(
      Math.max(longitudeSpan * INITIAL_REGION_PADDING_MULTIPLIER, INITIAL_REGION_MIN_DELTA),
      INITIAL_REGION_MAX_LONGITUDE_DELTA
    ),
  };
};

const toCountryAndCity = (record: AnalysisRecord, locale?: string, t?: TranslateFn) => {
  const effectiveIso = toEffectiveIsoCountryCode(record.location);
  const hasLocation = !!record.location && (!!record.location.country || !!effectiveIso);
  const uncategorized = t?.('history.folder.uncategorized', 'Uncategorized') ?? 'Uncategorized';
  const unknownCity = t?.('history.region.unknownCity', 'Unknown City') ?? 'Unknown City';
  const noLocationInfo = t?.('history.region.noLocationInfo', 'No Location Info') ?? 'No Location Info';
  const country = hasLocation
    ? toLocalizedCountryName(effectiveIso, record.location!.country, locale) || uncategorized
    : uncategorized;
  const city = hasLocation
    ? toLocalizedCityName(record.location!, locale) || unknownCity
    : noLocationInfo;
  return { hasLocation, country, city, effectiveIso };
};

export const aggregateHistoryByCountry = (
  records: AnalysisRecord[],
  locale?: string,
  t?: TranslateFn
): CountryData[] => {
  const countryMap = new Map<string, CountryData>();

  records.forEach((record) => {
    const { hasLocation, country, city, effectiveIso } = toCountryAndCity(record, locale, t);
    const localizedFoodName = getLocalizedFoodName(record, locale);
    const itemData = {
      id: record.id,
      name: localizedFoodName,
      type: toSafetyType(record.safetyStatus),
      timestamp: record.timestamp,
      emoji: getEmoji(localizedFoodName),
      imageUri: record.isBarcode ? getBarcodeImageUri() : (resolveImageUri(record.imageUri) || undefined),
      originalRecord: record,
    };

    if (!countryMap.has(country)) {
      const coordinates =
        hasLocation && record.location
          ? [record.location.longitude || 0, record.location.latitude || 0]
          : [0, 0];

      countryMap.set(country, {
        country,
        flag: hasLocation ? toFlagEmoji(effectiveIso) : '📁',
        total: 0,
        coordinates,
        regions: [],
      });
    }

    const countryEntry = countryMap.get(country)!;
    countryEntry.total += 1;

    if (
      hasLocation &&
      record.location &&
      countryEntry.coordinates[0] === 0 &&
      countryEntry.coordinates[1] === 0
    ) {
      countryEntry.coordinates = [record.location.longitude || 0, record.location.latitude || 0];
    }

    let region = countryEntry.regions.find((value) => value.name === city);
    if (!region) {
      region = { name: city, items: [] };
      countryEntry.regions.push(region);
    }
    region.items.push(itemData);
  });

  return Array.from(countryMap.values());
};

export const removeItemsFromArchive = (
  archiveData: CountryData[],
  deletedIds: Set<string>
): CountryData[] =>
  archiveData
    .map((country) => {
      const regions = country.regions
        .map((region) => ({
          ...region,
          items: region.items.filter((item) => !deletedIds.has(item.id)),
        }))
        .filter((region) => region.items.length > 0);

      const total = regions.reduce((sum, region) => sum + region.items.length, 0);
      return { ...country, regions, total };
    })
    .filter((country) => country.total > 0);
