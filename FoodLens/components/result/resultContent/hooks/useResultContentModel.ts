import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type {
  DecisionStatus,
  RecommendedAction,
  SafetyStatus,
} from '@/services/aiCore/types';
import { ResultContentProps } from '../types';
import { hasAllergenIngredients } from '../utils/contentMeta';
import { formatTimestamp, getLocationText } from '../utils/resultContentFormatters';
import {
  resolveLocalizedFoodName,
  resolveLocalizedIngredientName,
  resolveLocalizedSummary,
} from '../utils/localizedNames';

const resolveSafetyLabelFromDecisionStatus = (
  decisionStatus: DecisionStatus,
  t?: (key: string, fallback?: string) => string
): string => {
  if (decisionStatus === 'OK') {
    return t?.('result.safety.ok', 'OK') ?? 'OK';
  }

  if (decisionStatus === 'ASK') {
    return t?.('result.safety.ask', 'ASK') ?? 'ASK';
  }

  return t?.('result.safety.avoid', 'AVOID') ?? 'AVOID';
};

const resolveSafetyLabelFromSafetyStatus = (
  safetyStatus: SafetyStatus,
  t?: (key: string, fallback?: string) => string
): string => {
  if (safetyStatus === 'SAFE') {
    return t?.('result.safety.ok', 'OK') ?? 'OK';
  }

  if (safetyStatus === 'CAUTION') {
    return t?.('result.safety.ask', 'ASK') ?? 'ASK';
  }

  return t?.('result.safety.avoid', 'AVOID') ?? 'AVOID';
};

const resolveActionLabelFromRecommendedAction = (
  recommendedAction: RecommendedAction,
  t?: (key: string, fallback?: string) => string
): string => {
  if (recommendedAction === 'eat') {
    return t?.('result.action.eat', 'Safe to continue.') ?? 'Safe to continue.';
  }

  if (recommendedAction === 'verify_label') {
    return t?.('result.action.verifyLabel', 'Check the label before eating.') ?? 'Check the label before eating.';
  }

  if (recommendedAction === 'ask_staff') {
    return t?.('result.action.askStaff', 'Ask staff before eating.') ?? 'Ask staff before eating.';
  }

  return t?.('result.action.avoid', 'Avoid eating until ingredients are confirmed.') ?? 'Avoid eating until ingredients are confirmed.';
};

const resolveActionLabelFromSafetyStatus = (
  safetyStatus: SafetyStatus,
  t?: (key: string, fallback?: string) => string
): string => {
  if (safetyStatus === 'SAFE') {
    return t?.('result.action.safeFallback', 'Verify once more before eating.') ?? 'Verify once more before eating.';
  }

  if (safetyStatus === 'CAUTION') {
    return t?.('result.action.cautionFallback', 'Check the label or ask staff before eating.') ?? 'Check the label or ask staff before eating.';
  }

  return t?.('result.action.avoidFallback', 'Avoid eating until ingredients are confirmed.') ?? 'Avoid eating until ingredients are confirmed.';
};

const resolveDecisionVariant = (
  decisionStatus: DecisionStatus | undefined,
  safetyStatus: SafetyStatus
): 'ok' | 'ask' | 'avoid' => {
  if (decisionStatus === 'OK' || safetyStatus === 'SAFE') {
    return 'ok';
  }

  if (decisionStatus === 'ASK' || safetyStatus === 'CAUTION') {
    return 'ask';
  }

  return 'avoid';
};

const resolveDecisionChecklistItems = (
  decisionVariant: 'ok' | 'ask' | 'avoid',
  t?: (key: string, fallback?: string) => string
): string[] => {
  const followUpItem =
    decisionVariant === 'ok'
      ? t?.(
          'result.decision.checklist.ok',
          'Review the ingredient list before you continue.'
        ) ?? 'Review the ingredient list before you continue.'
      : decisionVariant === 'ask'
        ? t?.(
            'result.decision.checklist.ask',
            'Use your traveler card if you need to confirm with staff.'
          ) ?? 'Use your traveler card if you need to confirm with staff.'
        : t?.(
            'result.decision.checklist.avoid',
            'Use your traveler card before ordering or eating.'
          ) ?? 'Use your traveler card before ordering or eating.';

  return [followUpItem];
};

export const useResultContentModel = (
  result: ResultContentProps['result'],
  locationData: ResultContentProps['locationData'],
  timestamp?: string | null,
  t?: (key: string, fallback?: string) => string,
  locale?: string
) => {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const localizedSummary = resolveLocalizedSummary(result, locale);
  const decisionVariant = resolveDecisionVariant(result.decisionStatus, result.safetyStatus);
  const hasAllergens = hasAllergenIngredients(result.ingredients);
  const safetyLabel = result.decisionStatus
    ? resolveSafetyLabelFromDecisionStatus(result.decisionStatus, t)
    : resolveSafetyLabelFromSafetyStatus(result.safetyStatus, t);
  const actionLabel = result.recommendedAction
    ? resolveActionLabelFromRecommendedAction(result.recommendedAction, t)
    : resolveActionLabelFromSafetyStatus(result.safetyStatus, t);

  return {
    colorScheme,
    theme,
    decisionVariant,
    safetyLabel,
    actionLabel,
    decisionChecklistItems: resolveDecisionChecklistItems(
      decisionVariant,
      t
    ),
    hasAllergens,
    localizedFoodName: resolveLocalizedFoodName(result, locale),
    localizedSummary,
    localizedIngredients: result.ingredients.map((ingredient) => ({
      ...ingredient,
      displayName: resolveLocalizedIngredientName(ingredient, locale),
    })),
    locationText: getLocationText(
      locationData,
      t?.('result.location.none', 'No Location Info') ?? 'No Location Info',
      locale
    ),
    formattedTimestamp: timestamp ? formatTimestamp(timestamp, locale) : null,
  };
};
