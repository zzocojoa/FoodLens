import { buildInitialRegion } from '../historyDataUtils';
import type { AnalysisRecord } from '@/services/analysis/types';

jest.mock('../../services/imageStorage', () => ({
  getBarcodeImageUri: jest.fn(() => 'barcode://image'),
  resolveImageUri: jest.fn((value: string | undefined) => value || null),
}));

jest.mock('../../services/utils', () => ({
  getEmoji: jest.fn(() => '🍽️'),
}));

jest.mock('../../features/home/utils/localizedFoodName', () => ({
  getLocalizedFoodName: jest.fn((record: { foodName: string }) => record.foodName),
}));

const createAnalysisRecord = (
  id: string,
  latitude: number,
  longitude: number
): AnalysisRecord => ({
  id,
  foodName: 'Sample Food',
  ingredients: [],
  safetyStatus: 'SAFE',
  timestamp: new Date('2026-04-20T00:00:00.000Z'),
  location: {
    latitude,
    longitude,
    country: 'South Korea',
    city: 'Seoul',
    isoCountryCode: 'KR',
  },
});

const createLocationlessAnalysisRecord = (id: string): AnalysisRecord => ({
  id,
  foodName: 'Unknown',
  ingredients: [],
  safetyStatus: 'SAFE',
  timestamp: new Date('2026-04-20T00:00:00.000Z'),
});

describe('historyDataUtils', () => {
  it('builds a bounded initial region from all valid locations', () => {
    const region = buildInitialRegion([
      createAnalysisRecord('record-1', 35.1796, 129.0756),
      createAnalysisRecord('record-2', 37.5665, 126.9780),
    ]);

    expect(region).not.toBeNull();
    expect(region?.latitude).toBeCloseTo(36.37305, 5);
    expect(region?.longitude).toBeCloseTo(128.0268, 5);
    expect(region?.latitudeDelta).toBeCloseTo(3.81904, 5);
    expect(region?.longitudeDelta).toBeCloseTo(3.35616, 5);
  });

  it('returns null when every record is missing a usable location', () => {
    const region = buildInitialRegion([createLocationlessAnalysisRecord('record-3')]);

    expect(region).toBeNull();
  });

  it('caps oversized initial deltas for widely spread records', () => {
    const region = buildInitialRegion([
      createAnalysisRecord('record-4', 37.5665, -170),
      createAnalysisRecord('record-5', -33.8688, 179.9),
    ]);

    expect(region).not.toBeNull();
    expect(region?.latitudeDelta).toBeLessThanOrEqual(180);
    expect(region?.longitudeDelta).toBeLessThanOrEqual(360);
  });

  it('fits records across the dateline around the visited longitudes', () => {
    const region = buildInitialRegion([
      createAnalysisRecord('record-6', 35.6764, 139.6500),
      createAnalysisRecord('record-7', 64.2008, -149.4937),
    ]);

    expect(region).not.toBeNull();
    expect(Math.abs(region!.longitude)).toBeGreaterThan(140);
    expect(region?.longitudeDelta).toBeLessThan(120);
  });
});
