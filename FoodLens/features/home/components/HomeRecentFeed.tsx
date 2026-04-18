import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import type { AnalysisRecord } from '@/services/analysisService';

import { homeDashboardStyles } from './homeDashboardStyles';
import PearlSurfaceOverlay from './PearlSurfaceOverlay';
import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardSpacing,
  homeDashboardTypography,
} from './homeDashboardTokens';
import HomeRecentFeedItem from './HomeRecentFeedItem';

type TranslationFunction = (key: string, fallback?: string) => string;

type HomeRecentFeedProps = {
  items: AnalysisRecord[];
  title: string;
  meta: string;
  locale: string;
  t: TranslationFunction;
  onOpenResult: (item: AnalysisRecord) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenHistory: () => void;
};

export const HomeRecentFeed = ({
  items,
  title,
  meta,
  locale,
  t,
  onOpenResult,
  onDeleteItem,
  onOpenHistory,
}: HomeRecentFeedProps): React.JSX.Element => {
  return (
    <View style={[homeDashboardStyles.sectionCard, styles.container]}>
      <PearlSurfaceOverlay
        accentWashColor={homeDashboardColors.pearlPeach}
        baseBottomColor="#FFF8F0"
        baseTopColor={homeDashboardColors.pearlIvory}
        coolWashColor={homeDashboardColors.pearlMist}
        warmWashColor={homeDashboardColors.pearlGlow}
      />
      <View style={homeDashboardStyles.sectionHeaderRow}>
        <View style={homeDashboardStyles.sectionHeaderCopy}>
          <Text style={homeDashboardStyles.sectionTitle}>{title}</Text>
          <Text style={homeDashboardStyles.sectionMeta}>{meta}</Text>
        </View>

        <HapticTouchableOpacity
          activeOpacity={0.78}
          hapticType="selection"
          onPress={onOpenHistory}
          style={styles.seeAllChip}
        >
          <Text style={styles.seeAllText}>{t('home.scans.seeAll', 'See All')}</Text>
        </HapticTouchableOpacity>
      </View>

      {items.length > 0 ? (
        <View style={styles.list}>
          {items.map((item) => (
            <HomeRecentFeedItem
              key={item.id}
              item={item}
              locale={locale}
              t={t}
              onOpenResult={onOpenResult}
              onDeleteItem={onDeleteItem}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {t('home.scans.empty.title', 'No records for this day')}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t('home.scans.empty.subtitle', 'Try analyzing a new meal!')}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  seeAllChip: {
    minHeight: 32,
    paddingHorizontal: homeDashboardSpacing.sm,
    borderRadius: homeDashboardRadii.pill,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    backgroundColor: homeDashboardColors.paperMuted,
  },
  seeAllText: {
    color: homeDashboardColors.accentBlue,
    fontSize: homeDashboardTypography.caption,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  list: {
    gap: homeDashboardSpacing.xs,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: homeDashboardSpacing.xs,
    paddingVertical: homeDashboardSpacing.xl,
    paddingHorizontal: homeDashboardSpacing.md,
    borderRadius: homeDashboardRadii.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    backgroundColor: 'rgba(255, 252, 247, 0.72)',
  },
  emptyTitle: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.bodyStrong,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default HomeRecentFeed;
