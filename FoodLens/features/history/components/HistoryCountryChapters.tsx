import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/features/i18n';

import type { HistoryCountryChapter, HistoryRecentEntry } from '../types/historyViewModel.types';
import HistoryRecordRow from './HistoryRecordRow';
import HistorySurfaceCard from './HistorySurfaceCard';
import {
  historyDashboardColors as colors,
  historyDashboardRadii as radii,
  historyDashboardSpacing as spacing,
  historyDashboardToneTokens,
  historyDashboardTypography as typography,
} from './historyDashboardTokens';

type HistoryCountryChaptersProps = {
  chapters: HistoryCountryChapter[];
  expandedCountries: Set<string>;
  isEditMode: boolean;
  matchesFilter: (type: string | undefined) => boolean;
  onDelete: (id: string) => void;
  onEntryPress: (entry: HistoryRecentEntry) => void;
  onToggleCountry: (id: string) => void;
  onToggleItem: (id: string) => void;
  selectedItems: Set<string>;
};

type HistoryChapterBadgeProps = {
  label: string;
  value: string;
};

function HistoryChapterBadge({
  label,
  value,
}: HistoryChapterBadgeProps): React.JSX.Element {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{`${label} ${value}`}</Text>
    </View>
  );
}

export default function HistoryCountryChapters({
  chapters,
  expandedCountries,
  isEditMode,
  matchesFilter,
  onDelete,
  onEntryPress,
  onToggleCountry,
  onToggleItem,
  selectedItems,
}: HistoryCountryChaptersProps): React.JSX.Element {
  const { t } = useI18n();

  if (chapters.length === 0) {
    return (
      <HistorySurfaceCard accentWashColor={colors.pearlMist}>
        <Text style={styles.emptyTitle}>{t('history.chapters.empty', '기록이 아직 없습니다')}</Text>
      </HistorySurfaceCard>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('history.chapters.title', '챕터')}</Text>

      {chapters.map((chapter) => {
        const isExpanded = expandedCountries.has(chapter.id);
        const visibleRegions = chapter.countryData.regions
          .map((region) => ({
            name: region.name,
            items: region.items.filter((item) => matchesFilter(item.type)),
          }))
          .filter((region) => region.items.length > 0);

        return (
            <HistorySurfaceCard key={chapter.id} accentWashColor={colors.pearlPeach}>
              <Pressable
                accessibilityLabel={chapter.country}
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                onPress={() => onToggleCountry(chapter.id)}
                style={({ pressed }) => [styles.chapterHead, pressed ? styles.pressed : null]}
              >
                <View style={styles.chapterTopRow}>
                  <View style={styles.chapterTitleRow}>
                    <Text style={styles.flag}>{chapter.flag}</Text>
                    <Text style={styles.chapterTitle}>{chapter.country}</Text>
                  </View>
                  {isExpanded ? <ChevronUp color={colors.inkSoft} size={18} /> : <ChevronDown color={colors.inkSoft} size={18} />}
                </View>

                <View style={styles.chapterRule} />

                <View style={styles.chapterSummary}>
                  <HistoryChapterBadge label={t('history.chapters.total', '기록')} value={String(chapter.totalCount)} />
                  <View
                    style={[
                      styles.countPill,
                      {
                        backgroundColor: historyDashboardToneTokens.safe.backgroundColor,
                        borderColor: historyDashboardToneTokens.safe.borderColor,
                      },
                    ]}
                  >
                    <Text style={[styles.countPillLabel, { color: historyDashboardToneTokens.safe.textColor }]}>
                      {t('history.utility.safe', '안전')} {chapter.toneCounts.safe}
                    </Text>
                  </View>
                </View>
              </Pressable>

            {isExpanded ? (
              visibleRegions.length > 0 ? (
                <View style={styles.regionList}>
                  {visibleRegions.map((region) => (
                    <View key={`${chapter.id}-${region.name}`} style={styles.regionSection}>
                      <Text style={styles.regionTitle}>{region.name}</Text>
                      <View style={styles.records}>
                        {region.items.map((item) => (
                          <HistoryRecordRow
                            key={item.id}
                            entry={{
                              cityLabel: region.name,
                              countryCode: null,
                              countryLabel: chapter.country,
                              emoji: item.emoji,
                              foodName: item.name,
                              id: item.id,
                              imageUri: item.imageUri,
                              record: item.originalRecord,
                              timestamp: item.timestamp,
                              tone: item.type,
                            }}
                            isEditMode={isEditMode}
                            isSelected={selectedItems.has(item.id)}
                            onDelete={onDelete}
                            onPress={onEntryPress}
                            onToggleSelect={onToggleItem}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyFilter}>
                  {t('history.chapters.emptyFilter', '이 필터에는 표시할 기록이 없습니다')}
                </Text>
              )
            ) : null}
          </HistorySurfaceCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderCurve: 'continuous',
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 6,
  },
  badgeText: {
    color: colors.ink,
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
    backgroundColor: colors.accentRedSoft,
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
    color: colors.ink,
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
    color: colors.inkSoft,
    fontSize: typography.body,
    lineHeight: 20,
  },
  emptyTitle: {
    color: colors.inkSoft,
    fontSize: typography.bodyStrong,
    fontWeight: '700',
    lineHeight: 18,
  },
  flag: {
    fontSize: 17,
  },
  pressed: {
    opacity: 0.84,
  },
  records: {
    gap: spacing.xs,
  },
  regionList: {
    gap: spacing.md,
  },
  regionSection: {
    gap: spacing.xs,
  },
  regionTitle: {
    color: colors.accentBlue,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 14,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: '800',
    lineHeight: 28,
  },
});
