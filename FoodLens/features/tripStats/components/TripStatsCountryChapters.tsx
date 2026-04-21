import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { homeDashboardColors, homeDashboardRadii, homeDashboardSpacing, homeDashboardTypography } from '../../home/components/homeDashboardTokens';
import { homeDashboardStyles } from '../../home/components/homeDashboardStyles';
import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import {
  TripStatsCountryChapterCard,
  type TripStatsCountryChapterCardProps,
  type TripStatsCountryChapterCardSignalTone,
} from './TripStatsCountryChapterCard';

export type TripStatsCountryChapter = Readonly<{
  id: string;
  chapterLabel: string;
  countryCode: string;
  countryName: string;
  summary: string;
  safeCount: number;
  totalCount: number;
  signalLabel: string;
  signalTone: TripStatsCountryChapterCardSignalTone;
}>;

export type TripStatsCountryChaptersProps = Readonly<{
  title: string;
  meta: string;
  chapters: ReadonlyArray<TripStatsCountryChapter>;
  emptyTitle?: string;
  emptyDescription?: string;
  onPressChapter?: (chapterId: string) => void;
}>;

export function TripStatsCountryChapters({
  title,
  meta,
  chapters,
  emptyTitle,
  emptyDescription,
  onPressChapter,
}: TripStatsCountryChaptersProps): React.JSX.Element | null {
  if (chapters.length === 0) {
    if (typeof emptyTitle !== 'string' || emptyTitle.trim().length === 0) {
      return null;
    }

    return (
      <View style={[homeDashboardStyles.sectionCard, localStyles.container]}>
        <PearlSurfaceOverlay
          accentWashColor={homeDashboardColors.pearlMist}
          baseBottomColor="#FFF8F0"
          baseTopColor={homeDashboardColors.pearlIvory}
          coolWashColor={homeDashboardColors.pearlSage}
          warmWashColor={homeDashboardColors.pearlPeach}
        />

        <View style={homeDashboardStyles.sectionHeaderRow}>
          <View style={homeDashboardStyles.sectionHeaderCopy}>
            <Text style={localStyles.title}>{title}</Text>
            <Text style={localStyles.meta}>{meta}</Text>
          </View>

          <View style={[homeDashboardStyles.pill, localStyles.countPill]}>
            <Text style={[homeDashboardStyles.pillText, localStyles.countPillText]}>0</Text>
          </View>
        </View>

        <View style={localStyles.emptyState}>
          <Text style={localStyles.emptyTitle}>{emptyTitle}</Text>
          {typeof emptyDescription === 'string' && emptyDescription.trim().length > 0 ? (
            <Text style={localStyles.emptyDescription}>{emptyDescription}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[homeDashboardStyles.sectionCard, localStyles.container]}>
      <PearlSurfaceOverlay
        accentWashColor={homeDashboardColors.pearlMist}
        baseBottomColor="#FFF8F0"
        baseTopColor={homeDashboardColors.pearlIvory}
        coolWashColor={homeDashboardColors.pearlSage}
        warmWashColor={homeDashboardColors.pearlPeach}
      />

      <View style={homeDashboardStyles.sectionHeaderRow}>
        <View style={homeDashboardStyles.sectionHeaderCopy}>
          <Text style={localStyles.title}>{title}</Text>
          <Text style={localStyles.meta}>{meta}</Text>
        </View>

        <View style={[homeDashboardStyles.pill, localStyles.countPill]}>
          <Text style={[homeDashboardStyles.pillText, localStyles.countPillText]}>
            {String(chapters.length)}
          </Text>
        </View>
      </View>

      <View style={localStyles.list}>
        {chapters.map((chapter) => {
          const cardProps: TripStatsCountryChapterCardProps = {
            chapterLabel: chapter.chapterLabel,
            countryCode: chapter.countryCode,
            countryName: chapter.countryName,
            summary: chapter.summary,
            safeCount: chapter.safeCount,
            totalCount: chapter.totalCount,
            signalLabel: chapter.signalLabel,
            signalTone: chapter.signalTone,
            onPress: typeof onPressChapter === 'function' ? () => onPressChapter(chapter.id) : undefined,
          };

          return <TripStatsCountryChapterCard key={chapter.id} {...cardProps} />;
        })}
      </View>
    </View>
  );
}

export default TripStatsCountryChapters;

const localStyles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
    gap: homeDashboardSpacing.md,
  },
  title: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.section,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  meta: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '700',
    letterSpacing: 0.9,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  countPill: {
    minWidth: 44,
    backgroundColor: homeDashboardColors.surfaceMuted,
  },
  countPillText: {
    color: homeDashboardColors.ink,
  },
  list: {
    gap: homeDashboardSpacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: homeDashboardColors.surfaceMuted,
    borderRadius: homeDashboardRadii.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    gap: homeDashboardSpacing.xs,
    paddingHorizontal: homeDashboardSpacing.md,
    paddingVertical: homeDashboardSpacing.xl,
  },
  emptyTitle: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.bodyStrong,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyDescription: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'center',
  },
});
