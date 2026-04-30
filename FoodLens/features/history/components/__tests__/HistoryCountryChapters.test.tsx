/// <reference types="jest" />

import React from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { FlashList } from '@shopify/flash-list';

import HistoryCountryChapters from '../HistoryCountryChapters';
import { getHistoryDashboardColors } from '../historyDashboardTokens';
import type { HistoryCountryChapter } from '../../types/historyViewModel.types';

type FlashListMockItem = {
  key: string;
  type: string;
};

type FlashListMockProps = {
  data: FlashListMockItem[];
  extraData: {
    isEditMode: boolean;
    selectedItems: Set<string>;
  };
  getItemType: (item: FlashListMockItem) => string;
  keyExtractor: (item: FlashListMockItem, index: number) => string;
  refreshControl: React.ReactElement;
  style?: {
    flex?: number;
  };
};

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: jest.fn((props: {
      ListEmptyComponent?: React.ReactElement | null;
      ListHeaderComponent?: React.ReactElement | null;
      data: unknown[];
      keyExtractor: (item: unknown, index: number) => string;
      renderItem: (info: { item: unknown; index: number; target: string }) => React.ReactElement;
    }) =>
      React.createElement(
        View,
        { testID: 'history-flash-list' },
        props.ListHeaderComponent,
        props.data.length === 0 ? props.ListEmptyComponent : null,
        props.data.map((item, index) =>
          React.createElement(
            View,
            { key: props.keyExtractor(item, index) },
            props.renderItem({ item, index, target: 'Cell' })
          )
        )
      )
    ),
  };
});

jest.mock('../HistoryRecordRow', () => ({
  __esModule: true,
  default: ({
    entry,
    isEditMode,
    isSelected,
  }: {
    entry: { foodName: string; id: string };
    isEditMode: boolean;
    isSelected: boolean;
  }) => {
    const React = require('react');
    const { Text } = require('react-native');
    const stateLabel = isEditMode ? (isSelected ? 'selected' : 'unselected') : 'view';
    return React.createElement(Text, { testID: `history-record-${entry.id}` }, `${entry.foodName}:${stateLabel}`);
  },
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    locale: 'ko',
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const colors = getHistoryDashboardColors('light');

const createChapter = (): HistoryCountryChapter => ({
  cityCount: 1,
  country: '대한민국',
  countryData: {
    coordinates: [35.8714, 128.6014],
    country: '대한민국',
    flag: '🇰🇷',
    regions: [
      {
        items: [
          {
            emoji: '🍜',
            id: 'record-safe',
            name: '라면',
            originalRecord: { id: 'analysis-safe' } as never,
            timestamp: new Date('2026-04-20T00:00:00.000Z'),
            type: 'ok',
          },
          {
            emoji: '🥜',
            id: 'record-avoid',
            name: '땅콩소스',
            originalRecord: { id: 'analysis-avoid' } as never,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
            type: 'avoid',
          },
        ],
        name: '대구광역시',
      },
    ],
    total: 2,
  },
  flag: '🇰🇷',
  id: '대한민국-0',
  latestCityLabel: '대구광역시',
  latestRecordAt: new Date('2026-04-21T00:00:00.000Z'),
  latestRecordId: 'record-avoid',
  toneCounts: {
    caution: 0,
    danger: 1,
    safe: 1,
  },
  totalCount: 2,
});

const createLargeChapter = (itemCount: number): HistoryCountryChapter => ({
  ...createChapter(),
  countryData: {
    ...createChapter().countryData,
    regions: [
      {
        items: Array.from({ length: itemCount }, (_unused, index) => ({
          emoji: '🍜',
          id: `record-${index}`,
          name: `라면 ${index}`,
          originalRecord: { id: `analysis-${index}` } as never,
          timestamp: new Date('2026-04-20T00:00:00.000Z'),
          type: 'ok' as const,
        })),
        name: '대구광역시',
      },
    ],
    total: itemCount,
  },
  latestRecordId: `record-${itemCount - 1}`,
  totalCount: itemCount,
});

type RenderHistoryCountryChaptersOptions = {
  chapters?: HistoryCountryChapter[];
  expandedCountries: Set<string>;
  isEditMode?: boolean;
  matchesFilter: (type: string | undefined) => boolean;
  refreshControl?: React.ReactElement;
  selectedItems?: Set<string>;
};

const getLatestFlashListProps = (): FlashListMockProps => {
  const flashListMock = FlashList as unknown as jest.Mock;
  const props = flashListMock.mock.calls.at(-1)?.[0] as FlashListMockProps | undefined;

  if (!props) {
    throw new Error('Expected FlashList to be rendered');
  }

  return props;
};

const createHistoryCountryChaptersElement = (
  options: RenderHistoryCountryChaptersOptions
): React.ReactElement => {
  const chapters = options.chapters ?? [createChapter()];
  const isEditMode = options.isEditMode ?? false;
  const refreshControl = options.refreshControl ?? <RefreshControl refreshing={false} onRefresh={jest.fn()} />;
  const selectedItems = options.selectedItems ?? new Set<string>();

  return (
    <HistoryCountryChapters
      chapters={chapters}
      colors={colors}
      contentContainerStyle={{ paddingBottom: 24 }}
      expandedCountries={options.expandedCountries}
      isEditMode={isEditMode}
      isLoadingInitial={false}
      listHeaderComponent={(
        <View>
          <Text>header</Text>
        </View>
      )}
      matchesFilter={options.matchesFilter}
      onDelete={jest.fn()}
      onEntryPress={jest.fn()}
      onToggleCountry={jest.fn()}
      onToggleItem={jest.fn()}
      refreshControl={refreshControl}
      selectedItems={selectedItems}
    />
  );
};

const renderHistoryCountryChapters = (options: RenderHistoryCountryChaptersOptions): void => {
  render(createHistoryCountryChaptersElement(options));
};

describe('HistoryCountryChapters', () => {
  it('keeps collapsed chapters at header-level without mounting records', () => {
    renderHistoryCountryChapters({
      expandedCountries: new Set<string>(),
      matchesFilter: () => true,
    });

    expect(screen.getByText('header')).toBeTruthy();
    expect(screen.getByText('대한민국')).toBeTruthy();
    expect(screen.queryByTestId('history-record-record-safe')).toBeNull();
    expect(screen.queryByTestId('history-record-record-avoid')).toBeNull();
  });

  it('flattens expanded chapter regions and visible record rows', () => {
    renderHistoryCountryChapters({
      expandedCountries: new Set<string>(['대한민국-0']),
      matchesFilter: (type) => type === 'avoid',
    });

    expect(screen.getByText('대구광역시')).toBeTruthy();
    expect(screen.queryByTestId('history-record-record-safe')).toBeNull();
    expect(screen.getByTestId('history-record-record-avoid')).toBeTruthy();
    expect(screen.getByTestId('history-record-record-avoid').props.children).toBe('땅콩소스:view');
  });

  it('renders a filter-empty row for expanded chapters with no matching records', () => {
    renderHistoryCountryChapters({
      expandedCountries: new Set<string>(['대한민국-0']),
      matchesFilter: () => false,
    });

    expect(screen.getByText('이 필터에는 표시할 기록이 없습니다')).toBeTruthy();
  });

  it('keeps the virtualized list bounded and typed for recycling', () => {
    renderHistoryCountryChapters({
      expandedCountries: new Set<string>(['대한민국-0']),
      matchesFilter: () => true,
    });

    const props = getLatestFlashListProps();

    expect(props.style).toEqual(expect.objectContaining({ flex: 1 }));
    expect(props.getItemType(props.data[0])).toBe('chapter');
    expect(props.getItemType(props.data[1])).toBe('region');
    expect(props.getItemType(props.data[2])).toBe('record:view');
  });

  it('does not filter or flatten records from collapsed large chapters', () => {
    const matchesFilter = jest.fn(() => true);
    renderHistoryCountryChapters({
      chapters: [createLargeChapter(1000)],
      expandedCountries: new Set<string>(),
      matchesFilter,
    });

    const props = getLatestFlashListProps();

    expect(props.data).toHaveLength(1);
    expect(props.getItemType(props.data[0])).toBe('chapter');
    expect(matchesFilter).not.toHaveBeenCalled();
    expect(screen.queryByTestId('history-record-record-999')).toBeNull();
  });

  it('keeps expanded 300 item fixtures flattened with stable recycling keys', () => {
    renderHistoryCountryChapters({
      chapters: [createLargeChapter(300)],
      expandedCountries: new Set<string>(['대한민국-0']),
      matchesFilter: () => true,
    });

    const props = getLatestFlashListProps();

    expect(props.data).toHaveLength(302);
    expect(props.getItemType(props.data[0])).toBe('chapter');
    expect(props.getItemType(props.data[1])).toBe('region');
    expect(props.getItemType(props.data[301])).toBe('record:view');
    expect(props.keyExtractor(props.data[301], 301)).toBe('record:record-299');
  });

  it('keeps expanded 1000 item fixtures to one filter pass per record', () => {
    const matchesFilter = jest.fn(() => true);

    renderHistoryCountryChapters({
      chapters: [createLargeChapter(1000)],
      expandedCountries: new Set<string>(['대한민국-0']),
      matchesFilter,
    });

    const props = getLatestFlashListProps();

    expect(props.data).toHaveLength(1002);
    expect(matchesFilter).toHaveBeenCalledTimes(1000);
    expect(props.keyExtractor(props.data[1001], 1001)).toBe('record:record-999');
  });

  it('keeps flattened data stable when only selection changes', () => {
    const chapter = createLargeChapter(300);
    const expandedCountries = new Set<string>(['대한민국-0']);
    const matchesFilter = jest.fn(() => true);
    const initialOptions: RenderHistoryCountryChaptersOptions = {
      chapters: [chapter],
      expandedCountries,
      isEditMode: true,
      matchesFilter,
      selectedItems: new Set<string>(),
    };

    const view = render(createHistoryCountryChaptersElement(initialOptions));
    const initialProps = getLatestFlashListProps();

    matchesFilter.mockClear();
    view.rerender(
      createHistoryCountryChaptersElement({
        ...initialOptions,
        selectedItems: new Set<string>(['record-12']),
      })
    );

    const nextProps = getLatestFlashListProps();

    expect(nextProps.data).toBe(initialProps.data);
    expect(matchesFilter).not.toHaveBeenCalled();
    expect(nextProps.extraData.selectedItems.has('record-12')).toBe(true);
  });

  it('keeps region keys unique when repeated region names are present', () => {
    const repeatedRegionChapter: HistoryCountryChapter = {
      ...createChapter(),
      countryData: {
        ...createChapter().countryData,
        regions: [
          {
            items: [
              {
                emoji: '🍜',
                id: 'record-first-region',
                name: '라면',
                originalRecord: { id: 'analysis-first-region' } as never,
                timestamp: new Date('2026-04-20T00:00:00.000Z'),
                type: 'ok',
              },
            ],
            name: '서울특별시',
          },
          {
            items: [
              {
                emoji: '🍲',
                id: 'record-second-region',
                name: '찌개',
                originalRecord: { id: 'analysis-second-region' } as never,
                timestamp: new Date('2026-04-21T00:00:00.000Z'),
                type: 'ok',
              },
            ],
            name: '서울특별시',
          },
        ],
      },
    };

    renderHistoryCountryChapters({
      chapters: [repeatedRegionChapter],
      expandedCountries: new Set<string>(['대한민국-0']),
      matchesFilter: () => true,
    });

    const props = getLatestFlashListProps();

    expect(props.keyExtractor(props.data[1], 1)).toBe('region:대한민국-0:0:서울특별시');
    expect(props.keyExtractor(props.data[3], 3)).toBe('region:대한민국-0:1:서울특별시');
  });

  it('passes refresh and selected state through the virtualized list contract', () => {
    const refreshControl = <RefreshControl refreshing onRefresh={jest.fn()} />;
    renderHistoryCountryChapters({
      expandedCountries: new Set<string>(['대한민국-0']),
      isEditMode: true,
      matchesFilter: (type) => type === 'avoid',
      refreshControl,
      selectedItems: new Set<string>(['record-avoid']),
    });

    const props = getLatestFlashListProps();

    expect(props.refreshControl).toBe(refreshControl);
    expect(props.extraData.isEditMode).toBe(true);
    expect(props.extraData.selectedItems.has('record-avoid')).toBe(true);
    expect(props.getItemType(props.data[2])).toBe('record:edit');
    expect(screen.getByTestId('history-record-record-avoid').props.children).toBe('땅콩소스:selected');
  });
});
