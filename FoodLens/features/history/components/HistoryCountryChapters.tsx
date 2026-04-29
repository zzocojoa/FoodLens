import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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

export default function HistoryCountryChapters({
  chapters,
  colors,
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
  const toneTokens = getHistoryDashboardToneTokens(colors);

  if (chapters.length === 0) {
    return (
      <HistorySurfaceCard accentWashColor={colors.pearlMist} colors={colors}>
        <Text style={[styles.emptyTitle, { color: colors.inkSoft }]}>{t('history.chapters.empty', '기록이 아직 없습니다')}</Text>
      </HistorySurfaceCard>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>{t('history.chapters.title', '챕터')}</Text>

      {chapters.map((chapter) => {
        const isExpanded = expandedCountries.has(chapter.id);
        const visibleRegions = chapter.countryData.regions
          .map((region) => ({
            name: region.name,
            items: region.items.filter((item) => matchesFilter(item.type)),
          }))
          .filter((region) => region.items.length > 0);

        return (
            <HistorySurfaceCard key={chapter.id} accentWashColor={colors.pearlPeach} colors={colors}>
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
                    <Text style={[styles.chapterTitle, { color: colors.ink }]}>{chapter.country}</Text>
                  </View>
                  {isExpanded ? <ChevronUp color={colors.inkSoft} size={18} /> : <ChevronDown color={colors.inkSoft} size={18} />}
                </View>

                <View style={[styles.chapterRule, { backgroundColor: colors.accentRedSoft }]} />

                <View style={styles.chapterSummary}>
                  <HistoryChapterBadge colors={colors} label={t('history.chapters.total', '기록')} value={String(chapter.totalCount)} />
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
                      <Text style={[styles.regionTitle, { color: colors.accentBlue }]}>{region.name}</Text>
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
                            colors={colors}
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
                <Text style={[styles.emptyFilter, { color: colors.inkSoft }]}>
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
    color: historyDashboardColors.accentBlue,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 14,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: historyDashboardColors.ink,
    fontSize: typography.section,
    fontWeight: '800',
    lineHeight: 28,
  },
});
