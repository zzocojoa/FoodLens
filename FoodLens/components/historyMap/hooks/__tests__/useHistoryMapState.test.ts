import { renderHook, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { dispatchPhase2SyncQueue, enqueuePhase2Sync } from '@/services/sync/phase2SyncQueue';
import { updateUserClientState } from '@/services/user/clientStateService';
import type { ClusterOrPoint, MapMarker } from '../../types';
import { useHistoryMapState } from '../useHistoryMapState';

const mockUseHistoryMapDerivedData = jest.fn();

jest.mock('../useHistoryMapDerivedData', () => ({
  useHistoryMapDerivedData: (...args: unknown[]) => mockUseHistoryMapDerivedData(...args),
}));

jest.mock('../../constants', () => ({
  ENABLE_QA_MAP_METRICS: false,
  ENABLE_MAP_CLUSTERING: true,
  INITIAL_REGION: {
    latitude: 20,
    longitude: 0,
    latitudeDelta: 50,
    longitudeDelta: 50,
  },
  REGION_UPDATE_DEBOUNCE_MS: 250,
}));

jest.mock('../../utils/historyMapUtils', () => ({
  buildRegionKey: (region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) =>
    `${region.latitude}:${region.longitude}:${region.latitudeDelta}:${region.longitudeDelta}`,
  debugLog: jest.fn(),
  isValidDelta: (value: number) => Number.isFinite(value) && value > 0,
  isValidLatitude: (value: number) => Number.isFinite(value),
  isValidLongitude: (value: number) => Number.isFinite(value),
  metricsLog: jest.fn(),
}));

jest.mock('react-native-maps', () => {
  const mockReact = jest.requireActual('react') as typeof import('react');
  const MapView = mockReact.forwardRef(() => null);
  MapView.displayName = 'MockMapView';
  return {
    __esModule: true,
    default: MapView,
  };
});

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/services/sync/phase2SyncQueue', () => ({
  enqueuePhase2Sync: jest.fn(),
  dispatchPhase2SyncQueue: jest.fn(),
}));

jest.mock('@/services/user/clientStateService', () => ({
  updateUserClientState: jest.fn(),
}));

const mockedLocation = Location as jest.Mocked<typeof Location>;
const mockedEnqueuePhase2Sync = enqueuePhase2Sync as jest.MockedFunction<typeof enqueuePhase2Sync>;
const mockedDispatchPhase2SyncQueue =
  dispatchPhase2SyncQueue as jest.MockedFunction<typeof dispatchPhase2SyncQueue>;
const mockedUpdateUserClientState =
  updateUserClientState as jest.MockedFunction<typeof updateUserClientState>;

const createPointFeature = (index: number): ClusterOrPoint => ({
  type: 'Feature',
  properties: {
    markerIndex: index,
  },
  geometry: {
    type: 'Point',
    coordinates: [126.978 + index * 0.01, 37.5665 + index * 0.01],
  },
});

describe('useHistoryMapState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    } as never);

    const visibleClusteredItems: ClusterOrPoint[] = [
      createPointFeature(1),
      createPointFeature(2),
      createPointFeature(3),
    ];
    const clusteredItems: ClusterOrPoint[] = [
      createPointFeature(1),
      createPointFeature(2),
      createPointFeature(3),
      createPointFeature(4),
      createPointFeature(5),
    ];
    const markers: MapMarker[] = [];

    mockUseHistoryMapDerivedData.mockReturnValue({
      markers,
      visibleMarkers: markers,
      clusteredItems,
      visibleClusteredItems,
      isMarkerCapped: false,
      isClusteredCapped: true,
      renderedItemCount: visibleClusteredItems.length,
      favoriteCountry: 'Korea',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps toast state local without sync writes', async () => {
    const { result } = renderHook(() =>
      useHistoryMapState({
        data: [],
        initialRegion: null,
        onReady: undefined,
        onRegionChange: undefined,
      })
    );

    await waitFor(() => {
      expect(result.current.toastMessage).toBe('Cluster optimized: 3/5');
    });

    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
    expect(mockedDispatchPhase2SyncQueue).not.toHaveBeenCalled();
    expect(mockedUpdateUserClientState).not.toHaveBeenCalled();
  });
});
