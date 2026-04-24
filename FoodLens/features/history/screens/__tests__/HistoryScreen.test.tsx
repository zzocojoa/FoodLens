/// <reference types="jest" />

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import HistoryScreen from '../HistoryScreen';
import { useHistoryData } from '@/hooks/useHistoryData';
import { useHistoryFilter } from '@/hooks/useHistoryFilter';
import { navigateToResultFromHistory } from '@/components/historyList/services/historyNavigationService';
import { useHistoryScreen } from '../../hooks/useHistoryScreen';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore';
import { readHistoryStateSnapshot } from '@/services/user/clientStateService';

const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();
const mockTopLevelShell = jest.fn();

type ProfileUpdateListener = (
  reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write'
) => void;

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
  useRouter: () => ({
    back: mockRouterBack,
    push: mockRouterPush,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    useSafeAreaInsets: () => ({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    }),
  };
});

jest.mock('@/components/navigation/TopLevelScreenShell', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: ({
      activeItem,
      children,
      hideNav,
    }: {
      activeItem: string;
      children: React.ReactNode;
      hideNav: boolean;
    }) => {
      mockTopLevelShell({ activeItem, hideNav });
      return React.createElement(View, null, children);
    },
  };
});

jest.mock('../../../home/components/HomeBackgroundAtmosphere', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/HistoryJournalRail', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    const { View, Text } = require('react-native');
    return React.createElement(View, { testID: 'history-rail' }, React.createElement(Text, null, 'rail'));
  },
}));

jest.mock('../../components/HistoryFilterRail', () => ({
  __esModule: true,
  default: ({
    onChange,
  }: {
    onChange: (filter: 'all' | 'ask' | 'avoid' | 'ok') => void;
  }) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    return React.createElement(
      Pressable,
      { onPress: () => onChange('ask'), testID: 'history-filter' },
      React.createElement(Text, null, 'filter')
    );
  },
}));

jest.mock('../../components/HistorySelectionUtilityBar', () => ({
  __esModule: true,
  default: ({
    onSelectAll,
    totalCount,
  }: {
    onSelectAll: () => void;
    totalCount: number;
  }) => {
    const React = require('react');
    const { View, Text, Pressable } = require('react-native');
    return React.createElement(
      View,
      { testID: 'history-selection' },
      React.createElement(Text, { testID: 'history-selection-total' }, String(totalCount)),
      React.createElement(
        Pressable,
        { onPress: onSelectAll, testID: 'history-selection-select-all' },
        React.createElement(Text, null, 'select-all')
      )
    );
  },
}));

jest.mock('../../components/HistoryCountryChapters', () => ({
  __esModule: true,
  default: ({
    onEntryPress,
  }: {
    onEntryPress: (entry: { record: { id: string } }) => void;
  }) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    return React.createElement(
      Pressable,
      {
        onPress: () => onEntryPress({ record: { id: 'record-1' } }),
        testID: 'history-chapters',
      },
      React.createElement(Text, null, 'chapters')
    );
  },
}));

jest.mock('../../components/HistoryAtlasPanel', () => ({
  __esModule: true,
  default: ({
    onMarkerPress,
  }: {
    onMarkerPress: (id: string) => void;
  }) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    return React.createElement(
      Pressable,
      {
        onPress: () => onMarkerPress('JP'),
        testID: 'history-atlas',
      },
      React.createElement(Text, null, 'atlas')
    );
  },
}));

jest.mock('@/hooks/useHistoryData', () => ({
  useHistoryData: jest.fn(),
}));

jest.mock('@/hooks/useHistoryFilter', () => ({
  useHistoryFilter: jest.fn(),
}));

jest.mock('../../hooks/useHistoryScreen', () => ({
  useHistoryScreen: jest.fn(),
}));

jest.mock('@/components/historyList/services/historyNavigationService', () => ({
  navigateToResultFromHistory: jest.fn(),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

jest.mock('@/services/user/userProfileStore', () => ({
  subscribeUserProfileUpdated: jest.fn(() => jest.fn()),
}));

jest.mock('@/services/user/clientStateService', () => ({
  buildHistoryFilterPatch: jest.fn(() => ({})),
  buildHistoryMapRegionPatch: jest.fn(() => ({})),
  buildHistoryModePatch: jest.fn(() => ({})),
  readHistoryStateSnapshot: jest.fn(() => ({
    archiveMode: 'list',
    filter: 'all',
    mapRegion: null,
  })),
  updateUserClientState: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../constants/history.constants', () => ({
  getHistoryUserId: () => 'history-user',
}));

type HistoryScreenTestEnv = NodeJS.ProcessEnv & {
  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
};

const historyScreenTestEnv = process.env as HistoryScreenTestEnv;

const createHistoryDataMock = (): ReturnType<typeof useHistoryData> => ({
  archiveData: [],
  atlasSummary: {
    countriesWithLocationCount: 1,
    cityCount: 1,
    countryCount: 1,
    latestCityLabel: '대구광역시',
    latestCountryLabel: '대한민국',
    latestRecordAt: new Date('2026-04-20T00:00:00.000Z'),
    toneCounts: {
      caution: 1,
      danger: 0,
      safe: 2,
    },
    totalCount: 3,
  },
  countryChapters: [
    {
      cityCount: 1,
      country: '대한민국',
      countryData: {
        coordinates: [0, 0],
        country: '대한민국',
        flag: '🇰🇷',
        regions: [
          {
            items: [
              {
                emoji: '🍜',
                id: 'item-1',
                name: '라면',
                originalRecord: { id: 'record-1' } as never,
                timestamp: new Date('2026-04-20T00:00:00.000Z'),
                type: 'ok' as const,
              },
            ],
            name: '대구광역시',
          },
        ],
        total: 1,
      },
      flag: '🇰🇷',
      id: '대한민국-0',
      latestCityLabel: '대구광역시',
      latestRecordAt: new Date('2026-04-20T00:00:00.000Z'),
      latestRecordId: 'item-1',
      toneCounts: {
        caution: 0,
        danger: 0,
        safe: 1,
      },
      totalCount: 1,
    },
  ],
  deleteItem: jest.fn(),
  deleteMultipleItems: jest.fn(),
  expandedCountries: new Set<string>(),
  initialRegion: null,
  journalSummary: {
    cityCount: 1,
    countryCount: 1,
    latestCityLabel: '대구광역시',
    latestCountryLabel: '대한민국',
    latestRecordAt: new Date('2026-04-20T00:00:00.000Z'),
    toneCounts: {
      caution: 1,
      danger: 0,
      safe: 2,
    },
    totalCount: 3,
  },
  loadHistory: jest.fn(),
  loading: false,
  onRefresh: jest.fn(),
  recentEntries: [
    {
      cityLabel: '대구광역시',
      countryCode: 'KR',
      countryLabel: '대한민국',
      emoji: '🍜',
      foodName: '라면',
      id: 'record-1',
      imageUri: undefined,
      record: { id: 'record-1' } as never,
      timestamp: new Date('2026-04-20T00:00:00.000Z'),
      tone: 'ok' as const,
    },
  ],
  records: [{ id: 'record-1' } as never],
  refreshing: false,
  setExpandedCountries: jest.fn(),
} as unknown as ReturnType<typeof useHistoryData>);

describe('HistoryScreen', () => {
  const mockedUseHistoryData = useHistoryData as jest.MockedFunction<typeof useHistoryData>;
  const mockedUseHistoryFilter = useHistoryFilter as jest.MockedFunction<typeof useHistoryFilter>;
  const mockedUseHistoryScreen = useHistoryScreen as jest.MockedFunction<typeof useHistoryScreen>;
  const mockedSubscribeUserProfileUpdated =
    subscribeUserProfileUpdated as jest.MockedFunction<typeof subscribeUserProfileUpdated>;
  const mockedReadHistoryStateSnapshot =
    readHistoryStateSnapshot as jest.MockedFunction<typeof readHistoryStateSnapshot>;
  const originalGoogleMapsKey = historyScreenTestEnv.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    historyScreenTestEnv.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'history-test-key';
  });

  afterEach(() => {
    historyScreenTestEnv.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = originalGoogleMapsKey;
  });

  it('renders the journal mode shell and routes row presses to stored results', () => {
    const historyDataMock = createHistoryDataMock();

    mockedUseHistoryData.mockReturnValue(historyDataMock);
    mockedUseHistoryFilter.mockReturnValue({
      archiveFilter: 'all',
      getFilteredItemsCount: jest.fn(() => 1),
      isAllowedItemType: ((type: string | undefined): type is 'ask' | 'avoid' | 'ok' => Boolean(type)),
      matchesFilter: jest.fn(() => true),
      setArchiveFilter: jest.fn(),
    });
    mockedUseHistoryScreen.mockReturnValue({
      archiveMode: 'list',
      handleBulkDelete: jest.fn(),
      handleSwitchMode: jest.fn(),
      isEditMode: false,
      isMapModeAvailable: true,
      replaceSelection: jest.fn(),
      savedMapRegion: null,
      savedMapRegionRef: { current: null },
      selectedItems: new Set<string>(),
      setSavedMapRegion: jest.fn(),
      toggleEditMode: jest.fn(),
      toggleSelectItem: jest.fn(),
    });

    render(<HistoryScreen />);

    expect(mockTopLevelShell).toHaveBeenCalledWith({ activeItem: 'history', hideNav: false });
    expect(screen.getByTestId('history-rail')).toBeTruthy();
    expect(screen.queryByTestId('history-hero')).toBeNull();
    expect(screen.queryByTestId('history-recent')).toBeNull();

    fireEvent.press(screen.getByTestId('history-chapters'));

    expect(navigateToResultFromHistory).toHaveBeenCalledWith(
      expect.any(Object),
      { id: 'record-1' }
    );
  });

  it('renders the atlas mode shell and routes marker presses back to list mode', () => {
    const historyDataMock = createHistoryDataMock();
    const handleSwitchMode = jest.fn();

    mockedUseHistoryData.mockReturnValue({
      ...historyDataMock,
      initialRegion: {
        latitude: 35.1796,
        latitudeDelta: 0.1,
        longitude: 129.0756,
        longitudeDelta: 0.1,
      },
    });
    mockedUseHistoryFilter.mockReturnValue({
      archiveFilter: 'all',
      getFilteredItemsCount: jest.fn(() => 1),
      isAllowedItemType: ((type: string | undefined): type is 'ask' | 'avoid' | 'ok' => Boolean(type)),
      matchesFilter: jest.fn(() => true),
      setArchiveFilter: jest.fn(),
    });
    mockedUseHistoryScreen.mockReturnValue({
      archiveMode: 'map',
      handleBulkDelete: jest.fn(),
      handleSwitchMode,
      isEditMode: false,
      isMapModeAvailable: true,
      replaceSelection: jest.fn(),
      savedMapRegion: null,
      savedMapRegionRef: { current: null },
      selectedItems: new Set<string>(),
      setSavedMapRegion: jest.fn(),
      toggleEditMode: jest.fn(),
      toggleSelectItem: jest.fn(),
    });

    render(<HistoryScreen />);

    fireEvent.press(screen.getByTestId('history-atlas'));

    expect(handleSwitchMode).toHaveBeenCalledWith('list');
    expect(historyDataMock.setExpandedCountries).toHaveBeenCalledWith(new Set<string>(['JP']));
  });

  it('shows the selection utility bar while edit mode hides bottom navigation', () => {
    const historyDataMock = createHistoryDataMock();

    mockedUseHistoryData.mockReturnValue(historyDataMock);
    mockedUseHistoryFilter.mockReturnValue({
      archiveFilter: 'all',
      getFilteredItemsCount: jest.fn(() => 1),
      isAllowedItemType: ((type: string | undefined): type is 'ask' | 'avoid' | 'ok' => Boolean(type)),
      matchesFilter: jest.fn(() => true),
      setArchiveFilter: jest.fn(),
    });
    mockedUseHistoryScreen.mockReturnValue({
      archiveMode: 'list',
      handleBulkDelete: jest.fn(),
      handleSwitchMode: jest.fn(),
      isEditMode: true,
      isMapModeAvailable: true,
      replaceSelection: jest.fn(),
      savedMapRegion: null,
      savedMapRegionRef: { current: null },
      selectedItems: new Set<string>(['item-1']),
      setSavedMapRegion: jest.fn(),
      toggleEditMode: jest.fn(),
      toggleSelectItem: jest.fn(),
    });

    render(<HistoryScreen />);

    expect(mockTopLevelShell).toHaveBeenCalledWith({ activeItem: 'history', hideNav: true });
    expect(screen.getByTestId('history-selection')).toBeTruthy();
  });

  it('shows a loading card instead of the empty archive state during the initial fetch', () => {
    const historyDataMock = createHistoryDataMock();

    mockedUseHistoryData.mockReturnValue({
      ...historyDataMock,
      countryChapters: [],
      loading: true,
      records: [],
    });
    mockedUseHistoryFilter.mockReturnValue({
      archiveFilter: 'all',
      getFilteredItemsCount: jest.fn(() => 0),
      isAllowedItemType: ((type: string | undefined): type is 'ask' | 'avoid' | 'ok' => Boolean(type)),
      matchesFilter: jest.fn(() => true),
      setArchiveFilter: jest.fn(),
    });
    mockedUseHistoryScreen.mockReturnValue({
      archiveMode: 'list',
      handleBulkDelete: jest.fn(),
      handleSwitchMode: jest.fn(),
      isEditMode: false,
      isMapModeAvailable: true,
      replaceSelection: jest.fn(),
      savedMapRegion: null,
      savedMapRegionRef: { current: null },
      selectedItems: new Set<string>(),
      setSavedMapRegion: jest.fn(),
      toggleEditMode: jest.fn(),
      toggleSelectItem: jest.fn(),
    });

    render(<HistoryScreen />);

    expect(screen.getByText('Loading Passport...')).toBeTruthy();
    expect(screen.queryByTestId('history-chapters')).toBeNull();
  });

  it('selects only rows from expanded chapters in edit mode', () => {
    const replaceSelection = jest.fn();

    mockedUseHistoryData.mockReturnValue({
      ...createHistoryDataMock(),
      expandedCountries: new Set<string>(['대한민국-0']),
      countryChapters: [
        {
          ...createHistoryDataMock().countryChapters[0],
          id: '대한민국-0',
          countryData: {
            ...createHistoryDataMock().countryChapters[0].countryData,
            regions: [
              {
                name: '대구광역시',
                items: [
                  {
                    emoji: '🍜',
                    id: 'visible-item',
                    name: '라면',
                    originalRecord: { id: 'visible-record' } as never,
                    timestamp: new Date('2026-04-20T00:00:00.000Z'),
                    type: 'ok' as const,
                  },
                ],
              },
            ],
          },
        },
        {
          ...createHistoryDataMock().countryChapters[0],
          id: '일본-1',
          country: '일본',
          countryData: {
            ...createHistoryDataMock().countryChapters[0].countryData,
            country: '일본',
            regions: [
              {
                name: '후쿠오카',
                items: [
                  {
                    emoji: '🍣',
                    id: 'hidden-item',
                    name: '스시',
                    originalRecord: { id: 'hidden-record' } as never,
                    timestamp: new Date('2026-04-21T00:00:00.000Z'),
                    type: 'ok' as const,
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    mockedUseHistoryFilter.mockReturnValue({
      archiveFilter: 'all',
      getFilteredItemsCount: jest.fn(() => 2),
      isAllowedItemType: ((type: string | undefined): type is 'ask' | 'avoid' | 'ok' => Boolean(type)),
      matchesFilter: jest.fn(() => true),
      setArchiveFilter: jest.fn(),
    });
    mockedUseHistoryScreen.mockReturnValue({
      archiveMode: 'list',
      handleBulkDelete: jest.fn(),
      handleSwitchMode: jest.fn(),
      isEditMode: true,
      isMapModeAvailable: true,
      replaceSelection,
      savedMapRegion: null,
      savedMapRegionRef: { current: null },
      selectedItems: new Set<string>(),
      setSavedMapRegion: jest.fn(),
      toggleEditMode: jest.fn(),
      toggleSelectItem: jest.fn(),
    });

    render(<HistoryScreen />);

    expect(screen.getByTestId('history-selection-total').props.children).toBe('1');

    fireEvent.press(screen.getByTestId('history-selection-select-all'));

    expect(replaceSelection).toHaveBeenCalledWith(new Set<string>(['visible-item']));
  });

  it('ignores client_state_write profile updates', () => {
    jest.useFakeTimers();
    let listener: ProfileUpdateListener | null = null;
    mockedSubscribeUserProfileUpdated.mockImplementation((_userId: string, callback: ProfileUpdateListener) => {
      listener = callback;
      return jest.fn();
    });

    mockedUseHistoryData.mockReturnValue(createHistoryDataMock());
    mockedUseHistoryFilter.mockReturnValue({
      archiveFilter: 'all',
      getFilteredItemsCount: jest.fn(() => 1),
      isAllowedItemType: ((type: string | undefined): type is 'ask' | 'avoid' | 'ok' => Boolean(type)),
      matchesFilter: jest.fn(() => true),
      setArchiveFilter: jest.fn(),
    });
    mockedUseHistoryScreen.mockReturnValue({
      archiveMode: 'list',
      handleBulkDelete: jest.fn(),
      handleSwitchMode: jest.fn(),
      isEditMode: false,
      isMapModeAvailable: true,
      replaceSelection: jest.fn(),
      savedMapRegion: null,
      savedMapRegionRef: { current: null },
      selectedItems: new Set<string>(),
      setSavedMapRegion: jest.fn(),
      toggleEditMode: jest.fn(),
      toggleSelectItem: jest.fn(),
    });

    render(<HistoryScreen />);

    const invokeListener = (
      reason: Parameters<ProfileUpdateListener>[0]
    ): void => {
      if (listener === null) {
        throw new Error('Expected history profile listener to be registered');
      }

      (listener as ProfileUpdateListener)(reason);
    };

    act(() => {
      invokeListener('client_state_write');
      jest.advanceTimersByTime(250);
    });

    expect(mockedReadHistoryStateSnapshot).toHaveBeenCalledTimes(1);

    act(() => {
      invokeListener('sync_apply');
      jest.advanceTimersByTime(250);
    });

    expect(mockedReadHistoryStateSnapshot).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
