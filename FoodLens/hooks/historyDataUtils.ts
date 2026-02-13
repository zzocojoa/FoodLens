import { CountryData } from '../models/History';
import { AnalysisRecord } from '../services/analysisService';
import { resolveImageUri } from '../services/imageStorage';
import { getEmoji } from '../services/utils';

type SafetyType = 'ok' | 'avoid' | 'ask';

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

const toCountryAndCity = (record: AnalysisRecord) => {
  const hasLocation = !!record.location && !!record.location.country;
  const country = hasLocation ? record.location!.country! : 'Uncategorized';
  const city = hasLocation
    ? record.location!.city || record.location!.formattedAddress || 'Unknown City'
    : 'No Location Info';
  return { hasLocation, country, city };
};

export const aggregateHistoryByCountry = (records: AnalysisRecord[]): CountryData[] => {
  const countryMap = new Map<string, CountryData>();

  records.forEach((record) => {
    const { hasLocation, country, city } = toCountryAndCity(record);
    const itemData = {
      id: record.id,
      name: record.foodName,
      type: toSafetyType(record.safetyStatus),
      date: record.timestamp.toLocaleDateString(),
      emoji: getEmoji(record.foodName),
      imageUri: resolveImageUri(record.imageUri) || undefined,
      originalRecord: record,
    };

    if (!countryMap.has(country)) {
      const coordinates =
        hasLocation && record.location
          ? [record.location.longitude || 0, record.location.latitude || 0]
          : [0, 0];

      countryMap.set(country, {
        country,
        flag: hasLocation ? toFlagEmoji(record.location?.isoCountryCode) : '📁',
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
