import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { PearlSurfaceOverlay } from '../../home/components/PearlSurfaceOverlay';
import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardSpacing,
  homeDashboardTypography,
} from '../../home/components/homeDashboardTokens';
import { AllergiesTravelerPassportCard } from './AllergiesTravelerPassportCard';
import { useI18n } from '@/features/i18n';

export type AllergiesPassportHeroState = 'loading' | 'empty' | 'personalized' | 'generic' | 'card-unavailable';

export type AllergiesPassportSummary = {
  trackedItemCount: number;
  allergyCount: number;
  dietaryRestrictionCount: number;
  severeCount: number;
  moderateCount: number;
  mildCount: number;
};

export type AllergiesPassportCardCopy = {
  badgeLabel?: string;
  headline?: string;
  message?: string;
  languageLabel?: string;
  supportingLabel?: string;
};

export type AllergiesPassportHeroProps = {
  state: AllergiesPassportHeroState;
  summary: AllergiesPassportSummary;
  cardCopy?: AllergiesPassportCardCopy;
  onOpenTravelerCard?: () => void;
  onEditProfile?: () => void;
  style?: StyleProp<ViewStyle>;
};

type HeroTone = {
  badgeBackgroundColor: string;
  badgeTextColor: string;
  outerAccentColor: string;
  outerBaseBottomColor: string;
  outerBaseTopColor: string;
  outerCoolColor: string;
  outerWarmColor: string;
  titleColor: string;
  supportingColor: string;
};

const resolveHeroTone = (state: AllergiesPassportHeroState): HeroTone => {
  if (state === 'loading') {
    return {
      badgeBackgroundColor: homeDashboardColors.surfaceMuted,
      badgeTextColor: homeDashboardColors.inkSoft,
      outerAccentColor: homeDashboardColors.pearlMist,
      outerBaseBottomColor: homeDashboardColors.paperStrong,
      outerBaseTopColor: homeDashboardColors.pearlIvory,
      outerCoolColor: homeDashboardColors.pearlGlow,
      outerWarmColor: homeDashboardColors.pearlMist,
      titleColor: homeDashboardColors.ink,
      supportingColor: homeDashboardColors.inkSoft,
    };
  }

  if (state === 'empty') {
    return {
      badgeBackgroundColor: homeDashboardColors.accentAmberSoft,
      badgeTextColor: homeDashboardColors.accentAmber,
      outerAccentColor: homeDashboardColors.pearlPeach,
      outerBaseBottomColor: homeDashboardColors.paper,
      outerBaseTopColor: homeDashboardColors.pearlIvory,
      outerCoolColor: homeDashboardColors.pearlGlow,
      outerWarmColor: homeDashboardColors.pearlPeach,
      titleColor: homeDashboardColors.ink,
      supportingColor: homeDashboardColors.inkSoft,
    };
  }

  if (state === 'personalized') {
    return {
      badgeBackgroundColor: homeDashboardColors.accentGreenSoft,
      badgeTextColor: homeDashboardColors.accentGreen,
      outerAccentColor: homeDashboardColors.pearlSage,
      outerBaseBottomColor: homeDashboardColors.paperStrong,
      outerBaseTopColor: homeDashboardColors.pearlIvory,
      outerCoolColor: homeDashboardColors.pearlSage,
      outerWarmColor: homeDashboardColors.pearlGlow,
      titleColor: homeDashboardColors.ink,
      supportingColor: homeDashboardColors.inkSoft,
    };
  }

  if (state === 'generic') {
    return {
      badgeBackgroundColor: homeDashboardColors.surfaceMuted,
      badgeTextColor: homeDashboardColors.accentBlue,
      outerAccentColor: homeDashboardColors.pearlMist,
      outerBaseBottomColor: homeDashboardColors.paperMuted,
      outerBaseTopColor: homeDashboardColors.pearlIvory,
      outerCoolColor: homeDashboardColors.pearlMist,
      outerWarmColor: homeDashboardColors.pearlGlow,
      titleColor: homeDashboardColors.ink,
      supportingColor: homeDashboardColors.inkSoft,
    };
  }

  return {
    badgeBackgroundColor: homeDashboardColors.accentRedSoft,
    badgeTextColor: homeDashboardColors.accentRed,
    outerAccentColor: homeDashboardColors.pearlPeach,
    outerBaseBottomColor: homeDashboardColors.paperStrong,
    outerBaseTopColor: homeDashboardColors.pearlIvory,
    outerCoolColor: homeDashboardColors.pearlMist,
    outerWarmColor: homeDashboardColors.pearlPeach,
    titleColor: homeDashboardColors.ink,
    supportingColor: homeDashboardColors.inkSoft,
  };
};

const resolveStateLabel = (state: AllergiesPassportHeroState, t: (key: string, fallback?: string) => string): string => {
  if (state === 'loading') {
    return t('allergies.hero.state.loading', 'Syncing');
  }

  if (state === 'empty') {
    return t('allergies.hero.state.empty', 'Not ready');
  }

  if (state === 'personalized') {
    return t('allergies.hero.state.personalized', 'Personalized');
  }

  if (state === 'generic') {
    return t('allergies.hero.state.generic', 'Translated');
  }

  return t('allergies.hero.state.unavailable', 'Unavailable');
};

const resolveHeroTitle = (state: AllergiesPassportHeroState, t: (key: string, fallback?: string) => string): string => {
  if (state === 'loading') {
    return t('allergies.hero.loadingTitle', 'Preparing your passport card');
  }

  if (state === 'empty') {
    return t('allergies.hero.emptyTitle', 'Add allergy information');
  }

  if (state === 'personalized') {
    return t('allergies.hero.personalizedTitle', 'Your passport card is ready');
  }

  if (state === 'generic') {
    return t('allergies.hero.genericTitle', 'Translated safety card');
  }

  return t('allergies.hero.unavailableTitle', 'Card unavailable');
};

const resolveHeroDescription = (
  state: AllergiesPassportHeroState,
  t: (key: string, fallback?: string) => string
): string => {
  if (state === 'loading') {
    return t('allergies.hero.loadingDescription', 'Building a pearl-toned safety surface from your profile.');
  }

  if (state === 'empty') {
    return t(
      'allergies.hero.emptyDescription',
      'Add saved allergies to create a traveler-ready concierge card.'
    );
  }

  if (state === 'personalized') {
    return t(
      'allergies.hero.personalizedDescription',
      'Show this card to staff when you want the translated warning and your saved allergens together.'
    );
  }

  if (state === 'generic') {
    return t(
      'allergies.hero.genericDescription',
      'The translated safety warning is ready even before your personal allergens are attached.'
    );
  }

  return t(
    'allergies.hero.unavailableDescription',
    'The traveler card could not be prepared right now. Edit your profile to rebuild it.'
  );
};

const resolveSummaryPills = (
  state: AllergiesPassportHeroState,
  summary: AllergiesPassportSummary,
  t: (key: string, fallback?: string) => string
): string[] => {
  if (state === 'loading') {
    return [t('allergies.hero.loadingPill', 'Syncing profile')];
  }

  if (summary.trackedItemCount === 0) {
    return [t('allergies.hero.emptyPill', 'No saved items')];
  }

  const pills: string[] = [];

  if (summary.severeCount > 0) {
    pills.push(
      t('allergies.summary.severeTemplate', 'Severe {count}').replace('{count}', String(summary.severeCount))
    );
  }

  if (summary.moderateCount > 0) {
    pills.push(
      t('allergies.summary.moderateTemplate', 'Moderate {count}').replace('{count}', String(summary.moderateCount))
    );
  }

  if (summary.mildCount > 0) {
    pills.push(t('allergies.summary.mildTemplate', 'Mild {count}').replace('{count}', String(summary.mildCount)));
  }

  if (summary.dietaryRestrictionCount > 0) {
    pills.push(
      t('allergies.summary.restrictionsTemplate', 'Restrictions {count}').replace(
        '{count}',
        String(summary.dietaryRestrictionCount)
      )
    );
  }

  pills.push(
    t('allergies.summary.trackedTemplate', 'Tracked {count}').replace('{count}', String(summary.trackedItemCount))
  );

  return pills;
};

const resolveBadgeLabel = (state: AllergiesPassportHeroState, t: (key: string, fallback?: string) => string): string => {
  if (state === 'loading') {
    return t('allergies.hero.cardLoadingBadge', 'Loading');
  }

  if (state === 'empty') {
    return t('allergies.hero.cardEmptyBadge', 'Not ready');
  }

  if (state === 'personalized') {
    return t('allergies.hero.cardPersonalizedBadge', 'Personalized card');
  }

  if (state === 'generic') {
    return t('allergies.hero.cardGenericBadge', 'Translated card');
  }

  return t('allergies.hero.cardUnavailableBadge', 'Unavailable');
};

const resolveCardCopy = (
  state: AllergiesPassportHeroState,
  cardCopy: AllergiesPassportCardCopy | undefined,
  t: (key: string, fallback?: string) => string
): AllergiesPassportCardCopy => {
  const badgeLabel = cardCopy?.badgeLabel ?? resolveBadgeLabel(state, t);

  if (state === 'loading') {
    return {
      badgeLabel,
      headline: cardCopy?.headline ?? t('allergies.hero.loadingCardTitle', 'Preparing card surface'),
      message:
        cardCopy?.message ??
        t('allergies.hero.loadingCardMessage', 'The pearl grain surface is being shaped from your saved profile.'),
      supportingLabel: cardCopy?.supportingLabel,
      languageLabel: cardCopy?.languageLabel,
    };
  }

  if (state === 'empty') {
    return {
      badgeLabel,
      headline: cardCopy?.headline ?? t('allergies.hero.emptyCardTitle', 'No allergy card yet'),
      message:
        cardCopy?.message ??
        t(
          'allergies.hero.emptyCardMessage',
          'Add allergy information to unlock a traveler-ready card for restaurants and hotels.'
        ),
      supportingLabel: cardCopy?.supportingLabel ?? t('allergies.hero.emptyCardSupporting', 'Add info to continue'),
      languageLabel: cardCopy?.languageLabel,
    };
  }

  if (state === 'personalized') {
    return {
      badgeLabel,
      headline: cardCopy?.headline ?? t('allergies.hero.personalizedCardTitle', 'Personalized passport ready'),
      message:
        cardCopy?.message ??
        t(
          'allergies.hero.personalizedCardMessage',
          'Your saved allergens and translated warning are combined into one elegant travel surface.'
        ),
      supportingLabel:
        cardCopy?.supportingLabel ??
        t('allergies.hero.personalizedCardSupporting', 'Show this to staff when ordering'),
      languageLabel: cardCopy?.languageLabel,
    };
  }

  if (state === 'generic') {
    return {
      badgeLabel,
      headline: cardCopy?.headline ?? t('allergies.hero.genericCardTitle', 'Translated warning card'),
      message:
        cardCopy?.message ??
        t(
          'allergies.hero.genericCardMessage',
          'A neutral translated message is ready while your profile details are still being finalized.'
        ),
      supportingLabel:
        cardCopy?.supportingLabel ??
        t('allergies.hero.genericCardSupporting', 'Works before allergen personalization'),
      languageLabel: cardCopy?.languageLabel,
    };
  }

  return {
    badgeLabel,
    headline: cardCopy?.headline ?? t('allergies.hero.unavailableCardTitle', 'Card unavailable'),
    message:
      cardCopy?.message ??
      t(
        'allergies.hero.unavailableCardMessage',
        'The traveler card could not be prepared right now. Reopen your profile to try again.'
      ),
    supportingLabel:
      cardCopy?.supportingLabel ?? t('allergies.hero.unavailableCardSupporting', 'Edit profile to rebuild it'),
    languageLabel: cardCopy?.languageLabel,
  };
};

export function AllergiesPassportHero({
  state,
  summary,
  cardCopy,
  onOpenTravelerCard,
  onEditProfile,
  style,
}: AllergiesPassportHeroProps): React.JSX.Element {
  const { t } = useI18n();
  const tone = resolveHeroTone(state);
  const summaryPills = resolveSummaryPills(state, summary, t);
  const resolvedCardCopy = resolveCardCopy(state, cardCopy, t);

  const canPressCard = state === 'personalized' || state === 'generic' ? onOpenTravelerCard : undefined;

  return (
    <View style={[styles.heroShell, style]}>
      <PearlSurfaceOverlay
        accentWashColor={tone.outerAccentColor}
        baseBottomColor={tone.outerBaseBottomColor}
        baseTopColor={tone.outerBaseTopColor}
        coolWashColor={tone.outerCoolColor}
        warmWashColor={tone.outerWarmColor}
      />

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: tone.titleColor }]}>
              {resolveHeroTitle(state, t)}
            </Text>
            <Text style={[styles.description, { color: tone.supportingColor }]}>
              {resolveHeroDescription(state, t)}
            </Text>
          </View>

          <View style={[styles.stateBadge, { backgroundColor: tone.badgeBackgroundColor }]}>
            <Text style={[styles.stateBadgeText, { color: tone.badgeTextColor }]}>
              {resolveStateLabel(state, t)}
            </Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          {summaryPills.map((pill) => (
            <View key={pill} style={styles.summaryPill}>
              <Text style={styles.summaryPillText}>{pill}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actionRow}>
          {(state === 'personalized' || state === 'generic') && onOpenTravelerCard ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenTravelerCard}
              style={styles.primaryActionButton}
            >
              <Text style={styles.primaryActionText}>
                {t('allergies.action.viewTravelerCard', 'View larger card')}
              </Text>
            </Pressable>
          ) : null}

          {onEditProfile ? (
            <Pressable
              accessibilityRole="button"
              onPress={onEditProfile}
              style={styles.secondaryActionButton}
            >
              <Text style={styles.secondaryActionText}>
                {t('allergies.action.editProfile', 'Edit profile')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <AllergiesTravelerPassportCard state={state} copy={resolvedCardCopy} onPress={canPressCard} />
      </View>
    </View>
  );
}

export default AllergiesPassportHero;

const styles = StyleSheet.create({
  heroShell: {
    borderRadius: homeDashboardRadii.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    overflow: 'hidden',
    padding: homeDashboardSpacing.lg,
    position: 'relative',
    boxShadow: '0 26px 60px rgba(34, 29, 20, 0.16)',
  },
  content: {
    gap: homeDashboardSpacing.lg,
    zIndex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: homeDashboardSpacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: homeDashboardSpacing.xs,
    minWidth: 0,
  },
  title: {
    fontSize: 31,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  description: {
    fontSize: homeDashboardTypography.body,
    lineHeight: 20,
    fontWeight: '500',
  },
  stateBadge: {
    minHeight: 32,
    paddingHorizontal: homeDashboardSpacing.sm,
    borderRadius: homeDashboardRadii.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stateBadgeText: {
    fontSize: homeDashboardTypography.caption,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: homeDashboardSpacing.xs,
    alignItems: 'center',
  },
  summaryPill: {
    minHeight: 30,
    paddingHorizontal: homeDashboardSpacing.sm,
    borderRadius: homeDashboardRadii.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    backgroundColor: homeDashboardColors.surfaceMuted,
    justifyContent: 'center',
  },
  summaryPillText: {
    fontSize: homeDashboardTypography.caption,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: homeDashboardColors.inkSoft,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: homeDashboardSpacing.sm,
  },
  primaryActionButton: {
    alignItems: 'center',
    backgroundColor: homeDashboardColors.ink,
    borderColor: homeDashboardColors.ink,
    borderCurve: 'continuous',
    borderRadius: homeDashboardRadii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: homeDashboardSpacing.lg,
  },
  primaryActionText: {
    color: homeDashboardColors.paper,
    fontSize: homeDashboardTypography.bodyStrong,
    fontWeight: '800',
    lineHeight: 18,
  },
  secondaryActionButton: {
    alignItems: 'center',
    backgroundColor: homeDashboardColors.surfaceMuted,
    borderColor: homeDashboardColors.lineStrong,
    borderCurve: 'continuous',
    borderRadius: homeDashboardRadii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: homeDashboardSpacing.lg,
  },
  secondaryActionText: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.bodyStrong,
    fontWeight: '800',
    lineHeight: 18,
  },
});
