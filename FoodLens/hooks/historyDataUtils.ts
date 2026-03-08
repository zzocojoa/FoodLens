import { CountryData } from '../models/History';
import { AnalysisRecord } from '../services/analysisService_Logic';
import { getBarcodeImageUri, resolveImageUri } from '../services/imageStorage_Logic';
import { getEmoji } from '../services/utils';
import { getLocalizedFoodName } from '../features/home/utils/localizedFoodName';
export { flattenHistoryData } from './historyDataFlatten';
export type { FlattenedHistoryItem } from './historyDataFlatten';

type SafetyType = 'ok' | 'avoid' | 'ask';
type TranslateFn = (key: string, fallback?: string) => string;

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
  try {
    const display = new Intl.DisplayNames([toLocaleTag(locale)], { type: 'region' });
    return display.of(iso) || fallbackCountry;
  } catch {
    return fallbackCountry || iso;
  }
};

const toLocalizedCityName = (
  location: NonNullable<AnalysisRecord['location']>,
  locale?: string
): string | undefined => {
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
  const language = (toLocaleTag(locale).split('-')[0] || '').toLowerCase();
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
  if (language === 'en') {
    return CITY_OVERRIDES_EN[raw] || raw;
  }
  return raw;
};

const hasValidLocation = (record: AnalysisRecord): boolean =>
  !!record.location &&
  !!record.location.latitude &&
  !!record.location.longitude &&
  (record.location.latitude !== 0 || record.location.longitude !== 0);

export const buildInitialRegion = (records: AnalysisRecord[]) => {
  for (const record of records) {
    if (!hasValidLocation(record)) continue;
    return {
      latitude: record.location!.latitude,
      longitude: record.location!.longitude,
      latitudeDelta: 50,
      longitudeDelta: 50,
    };
  }
  return null;
};

const toCountryAndCity = (record: AnalysisRecord, locale?: string, t?: TranslateFn) => {
  const effectiveIso = toEffectiveIsoCountryCode(record.location);
  const hasLocation = !!record.location && (!!record.location.country || !!effectiveIso);
  const country = hasLocation
    ? toLocalizedCountryName(effectiveIso, record.location!.country, locale) ||
      (t?.('history.folder.uncategorized', 'Uncategorized') ?? 'Uncategorized')
    : (t?.('history.folder.uncategorized', 'Uncategorized') ?? 'Uncategorized');
  const city = hasLocation
    ? toLocalizedCityName(record.location!, locale) ||
      (t?.('history.region.unknownCity', 'Unknown City') ?? 'Unknown City')
    : (t?.('history.region.noLocationInfo', 'No Location Info') ?? 'No Location Info');
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
