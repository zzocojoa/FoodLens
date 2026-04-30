import React, { useCallback, useMemo } from 'react';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useI18n } from '@/features/i18n';

import type { HistoryCountryChapter, HistoryRecentEntry } from '../types/historyViewModel.types';
import HistoryRecordRow from './HistoryRecordRow';
import HistorySurfaceCard from './HistorySurfaceCard';
import {
  getHistoryDashboardToneTokens,
  historyDashboardColors,
  historyDashboardRadii as radii,
  historyDashboardSpacing as spacing,
  historyDashboardTypography as typography,
  type HistoryDashboardColors,
} from './historyDashboardTokens';

type HistoryCountryChaptersProps = {
  chapters: HistoryCountryChapter[];
  colors: HistoryDashboardColors;
  contentContainerStyle: StyleProp<ViewStyle>;
  expandedCountries: Set<string>;
  isEditMode: boolean;
  isLoadingInitial: boolean;
  listHeaderComponent: React.ReactElement;
  matchesFilter: (type: string | undefined) => boolean;
  onDelete: (id: string) => void;
  onEntryPress: (entry: HistoryRecentEntry) => void;
  refreshControl: React.ReactElement<RefreshControlProps>;
  onToggleCountry: (id: string) => void;
  onToggleItem: (id: string) => void;
  selectedItems: Set<string>;
};

type HistoryChapterHeaderItem = {
  chapter: HistoryCountryChapter;
  isExpanded: boolean;
  key: string;
  type: 'chapter';
};

type HistoryRegionHeaderItem = {
  key: string;
  name: string;
  type: 'region';
};

type HistoryRecordItem = {
  entry: HistoryRecentEntry;
  key: string;
  type: 'record';
};

type HistoryEmptyFilterItem = {
  key: string;
  type: 'empty-filter';
};

type HistoryChapterListItem =
  | HistoryChapterHeaderItem
  | HistoryRegionHeaderItem
  | HistoryRecordItem
  | HistoryEmptyFilterItem;

type HistoryChapterListExtraData = {
  colors: HistoryDashboardColors;
  isEditMode: boolean;
  selectedItems: Set<string>;
};

type HistoryRegionData = HistoryCountryChapter['countryData']['regions'][number];
type HistoryRegionRecord = HistoryRegionData['items'][number];

type HistoryChapterBadgeProps = {
  colors: HistoryDashboardColors;
  label: string;
  value: string;
};

function HistoryChapterBadge({
  colors,
  label,
  value,
}: HistoryChapterBadgeProps): React.JSX.Element {
  return (
    <View style={[styles.badge, { backgroundColor: colors.surfaceMuted, borderColor: colors.line }]}>
      <Text style={[styles.badgeText, { color: colors.ink }]}>{`${label} ${value}`}</Text>
    </View>
  );
}

const createHistoryRecordItem = (
  chapter: HistoryCountryChapter,
  region: HistoryRegionData,
  recordItem: HistoryRegionRecord,
): HistoryRecordItem => ({
  entry: {
    cityLabel: region.name,
    countryCode: null,
    countryLabel: chapter.country,
    emoji: recordItem.emoji,
    foodName: recordItem.name,
    id: recordItem.id,
    imageUri: recordItem.imageUri,
    record: recordItem.originalRecord,
    timestamp: recordItem.timestamp,
    tone: recordItem.type,
  },
  key: `record:${recordItem.id}`,
  type: 'record',
});

const appendVisibleRegionItems = (
  items: HistoryChapterListItem[],
  chapter: HistoryCountryChapter,
  region: HistoryRegionData,
  regionIndex: number,
  matchesFilter: (type: string | undefined) => boolean,
): void => {
  let hasVisibleRegionHeader = false;

  region.items.forEach((recordItem) => {
    if (!matchesFilter(recordItem.type)) {
      return;
    }

    if (!hasVisibleRegionHeader) {
      items.push({
        key: `region:${chapter.id}:${regionIndex}:${region.name}`,
        name: region.name,
        type: 'region',
      });
      hasVisibleRegionHeader = true;
    }

    items.push(createHistoryRecordItem(chapter, region, recordItem));
  });
};

const createHistoryChapterListData = (
  chapters: HistoryCountryChapter[],
  expandedCountries: Set<string>,
  matchesFilter: (type: string | undefined) => boolean,
): HistoryChapterListItem[] => {
  const items: HistoryChapterListItem[] = [];

  chapters.forEach((chapter) => {
    const isExpanded = expandedCountries.has(chapter.id);
    const chapterItem: HistoryChapterHeaderItem = {
      chapter,
      isExpanded,
      key: `chapter:${chapter.id}`,
      type: 'chapter',
    };
    items.push(chapterItem);

    if (!isExpanded) {
      return;
    }

    const expandedItemCount = items.length;
    chapter.countryData.regions.forEach((region, regionIndex) => {
      appendVisibleRegionItems(items, chapter, region, regionIndex, matchesFilter);
    });

    if (items.length === expandedItemCount) {
      items.push({
        key: `empty-filter:${chapter.id}`,
        type: 'empty-filter',
      });
    }
  });

  return items;
};

export default function HistoryCountryChapters({
  chapters,
  colors,
  contentContainerStyle,
  expandedCountries,
  isEditMode,
  isLoadingInitial,
  listHeaderComponent,
  matchesFilter,
  onDelete,
  onEntryPress,
  refreshControl,
  onToggleCountry,
  onToggleItem,
  selectedItems,
}: HistoryCountryChaptersProps): React.JSX.Element {
  const { t } = useI18n();
  const toneTokens = getHistoryDashboardToneTokens(colors);
  const listData = useMemo((): HistoryChapterListItem[] => {
    return createHistoryChapterListData(chapters, expandedCountries, matchesFilter);
  }, [chapters, expandedCountries, matchesFilter]);

  const listHeader = useMemo(() => (
    <View style={styles.listHeader}>
      {listHeaderComponent}
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>{t('history.chapters.title', '챕터')}</Text>
    </View>
  ), [colors.ink, listHeaderComponent, t]);

  const listEmpty = useMemo(() => {
    if (isLoadingInitial) {
      return null;
    }

    return (
      <HistorySurfaceCard accentWashColor={colors.pearlMist} colors={colors}>
        <Text style={[styles.emptyTitle, { color: colors.inkSoft }]}>{t('history.chapters.empty', '기록이 아직 없습니다')}</Text>
      </HistorySurfaceCard>
    );
  }, [colors, isLoadingInitial, t]);

  const listExtraData = useMemo(
    (): HistoryChapterListExtraData => ({
      colors,
      isEditMode,
      selectedItems,
    }),
    [colors, isEditMode, selectedItems],
  );

  const renderItem = useCallback(({ item }: ListRenderItemInfo<HistoryChapterListItem>): React.JSX.Element => {
    switch (item.type) {
      case 'chapter':
        return (
          <HistorySurfaceCard accentWashColor={colors.pearlPeach} colors={colors}>
            <Pressable
              accessibilityLabel={item.chapter.country}
              accessibilityRole="button"
              accessibilityState={{ expanded: item.isExpanded }}
              onPress={() => onToggleCountry(item.chapter.id)}
              style={({ pressed }) => [styles.chapterHead, pressed ? styles.pressed : null]}
            >
              <View style={styles.chapterTopRow}>
                <View style={styles.chapterTitleRow}>
                  <Text style={styles.flag}>{item.chapter.flag}</Text>
                  <Text style={[styles.chapterTitle, { color: colors.ink }]}>{item.chapter.country}</Text>
                </View>
                {item.isExpanded ? <ChevronUp color={colors.inkSoft} size={18} /> : <ChevronDown color={colors.inkSoft} size={18} />}
              </View>

              <View style={[styles.chapterRule, { backgroundColor: colors.accentRedSoft }]} />

              <View style={styles.chapterSummary}>
                <HistoryChapterBadge colors={colors} label={t('history.chapters.total', '기록')} value={String(item.chapter.totalCount)} />
                <View
                  style={[
                    styles.countPill,
                    {
                      backgroundColor: toneTokens.safe.backgroundColor,
                      borderColor: toneTokens.safe.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.countPillLabel, { color: toneTokens.safe.textColor }]}>
                    {t('history.utility.safe', '안전')} {item.chapter.toneCounts.safe}
                  </Text>
                </View>
              </View>
            </Pressable>
          </HistorySurfaceCard>
        );

      case 'region':
        return (
          <View style={styles.regionSection}>
            <Text style={[styles.regionTitle, { color: colors.accentBlue }]}>{item.name}</Text>
          </View>
        );

      case 'record':
        return (
          <HistoryRecordRow
            entry={item.entry}
            isEditMode={isEditMode}
            isSelected={selectedItems.has(item.entry.id)}
            colors={colors}
            onDelete={onDelete}
            onPress={onEntryPress}
            onToggleSelect={onToggleItem}
          />
        );

      case 'empty-filter':
        return (
          <Text style={[styles.emptyFilter, { color: colors.inkSoft }]}>
            {t('history.chapters.emptyFilter', '이 필터에는 표시할 기록이 없습니다')}
          </Text>
        );
    }
  }, [
    colors,
    isEditMode,
    onDelete,
    onEntryPress,
    onToggleCountry,
    onToggleItem,
    selectedItems,
    t,
    toneTokens.safe.backgroundColor,
    toneTokens.safe.borderColor,
    toneTokens.safe.textColor,
  ]);

  const keyExtractor = useCallback((item: HistoryChapterListItem): string => item.key, []);
  const getItemType = useCallback((item: HistoryChapterListItem): string => {
    if (item.type === 'record') {
      return isEditMode ? 'record:edit' : 'record:view';
    }

    return item.type;
  }, [isEditMode]);

  return (
    <FlashList
      contentContainerStyle={contentContainerStyle}
      data={listData}
      extraData={listExtraData}
      getItemType={getItemType}
      ItemSeparatorComponent={HistoryChapterItemSeparator}
      keyExtractor={keyExtractor}
      ListEmptyComponent={listEmpty}
      ListHeaderComponent={listHeader}
      ListHeaderComponentStyle={styles.headerComponent}
      refreshControl={refreshControl}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      style={styles.list}
    />
  );
}

function HistoryChapterItemSeparator(): React.JSX.Element {
  return <View style={styles.itemSeparator} />;
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: historyDashboardColors.surfaceMuted,
    borderColor: historyDashboardColors.line,
    borderCurve: 'continuous',
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 6,
  },
  badgeText: {
    color: historyDashboardColors.ink,
    fontSize: typography.caption,
    fontWeight: '800',
    lineHeight: 14,
  },
  chapterHead: {
    gap: spacing.xs,
  },
  chapterTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chapterRule: {
    alignSelf: 'flex-start',
    backgroundColor: historyDashboardColors.accentRedSoft,
    borderRadius: radii.pill,
    height: 2,
    width: 28,
  },
  chapterSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  chapterTitle: {
    color: historyDashboardColors.ink,
    flex: 1,
    fontSize: typography.bodyStrong + 1,
    fontWeight: '800',
    lineHeight: 20,
  },
  chapterTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  countPill: {
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 6,
  },
  countPillLabel: {
    fontSize: typography.caption - 1,
    fontWeight: '700',
    lineHeight: 12,
  },
  emptyFilter: {
    color: historyDashboardColors.inkSoft,
    fontSize: typography.body,
    lineHeight: 20,
  },
  emptyTitle: {
    color: historyDashboardColors.inkSoft,
    fontSize: typography.bodyStrong,
    fontWeight: '700',
    lineHeight: 18,
  },
  flag: {
    fontSize: 17,
  },
  headerComponent: {
    marginBottom: spacing.xs,
  },
  itemSeparator: {
    height: spacing.xs,
  },
  list: {
    flex: 1,
  },
  listHeader: {
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.84,
  },
  regionSection: {
    gap: spacing.xs,
  },
  regionTitle: {
    color: historyDashboardColors.accentBlue,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 14,
  },
  sectionTitle: {
    color: historyDashboardColors.ink,
    fontSize: typography.section,
    fontWeight: '800',
    lineHeight: 28,
  },
});
