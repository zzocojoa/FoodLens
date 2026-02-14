import { CountryData } from '../models/History';

export type FlattenedHistoryItem =
  | { type: 'country-header'; id: string; country: CountryData; index: number }
  | { type: 'region-header'; id: string; name: string }
  | { type: 'food-item'; id: string; data: CountryData['regions'][number]['items'][number]; countryName: string }
  | { type: 'empty-region'; id: string; filter: string };

export const flattenHistoryData = (
  data: CountryData[],
  expandedCountries: Set<string>,
  filter: string,
  matchesFilter: (type: string | undefined) => boolean,
  isAllowedItemType: (type: string | undefined) => boolean
): FlattenedHistoryItem[] => {
  const flattened: FlattenedHistoryItem[] = [];

  data.forEach((country, countryIdx) => {
    const countryKey = `${country.country}-${countryIdx}`;
    const isExpanded = expandedCountries.has(countryKey);

    flattened.push({
      type: 'country-header',
      id: countryKey,
      country,
      index: countryIdx,
    });

    if (!isExpanded) return;

    let countryHasVisibleItems = false;

    country.regions.forEach((region, regionIdx) => {
      const visibleItems = (region.items || []).filter(
        (item) => isAllowedItemType(item.type) && matchesFilter(item.type)
      );

      if (visibleItems.length === 0) return;
      countryHasVisibleItems = true;

      flattened.push({
        type: 'region-header',
        id: `${countryKey}-reg-${regionIdx}`,
        name: region.name,
      });

      visibleItems.forEach((item) => {
        flattened.push({
          type: 'food-item',
          id: item.id,
          data: item,
          countryName: country.country,
        });
      });
    });

    if (!countryHasVisibleItems) {
      flattened.push({
        type: 'empty-region',
        id: `${countryKey}-empty`,
        filter,
      });
    }
  });

  return flattened;
};
