import type { OnboardingDestination, SafetyPriority } from '../types/onboarding.types';

type PriorityOption = {
  id: SafetyPriority;
  icon: string;
  titleKey: string;
  titleFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
};

export const SAFETY_PRIORITY_OPTIONS: PriorityOption[] = [
  {
    id: 'allergy',
    icon: '!',
    titleKey: 'onboarding.priority.allergyTitle',
    titleFallback: 'Allergy risk',
    descriptionKey: 'onboarding.priority.allergyDesc',
    descriptionFallback: 'Detect ingredients that could be dangerous for you first.',
  },
  {
    id: 'diet',
    icon: 'V',
    titleKey: 'onboarding.priority.dietTitle',
    titleFallback: 'Diet limits',
    descriptionKey: 'onboarding.priority.dietDesc',
    descriptionFallback: 'Keep vegan, gluten, dairy, and other limits visible.',
  },
  {
    id: 'travel',
    icon: 'T',
    titleKey: 'onboarding.priority.travelTitle',
    titleFallback: 'Travel communication',
    descriptionKey: 'onboarding.priority.travelDesc',
    descriptionFallback: 'Prepare local-language cards and restaurant guidance.',
  },
];

export const ONBOARDING_DESTINATIONS: OnboardingDestination[] = [
  {
    id: 'japan',
    countryCode: 'JP',
    currentTripLocation: 'Japan',
    targetLanguage: 'ja-JP',
    titleKey: 'onboarding.destination.japan',
    titleFallback: 'Japan',
    subtitleKey: 'onboarding.destination.japanSubtitle',
    subtitleFallback: 'Japanese allergy card',
    languageLabelKey: 'travelerCard.language.japanese',
    languageLabelFallback: 'Japanese',
  },
  {
    id: 'thailand',
    countryCode: 'TH',
    currentTripLocation: 'Thailand',
    targetLanguage: 'th-TH',
    titleKey: 'onboarding.destination.thailand',
    titleFallback: 'Thailand',
    subtitleKey: 'onboarding.destination.thailandSubtitle',
    subtitleFallback: 'Thai allergy card',
    languageLabelKey: 'travelerCard.language.thai',
    languageLabelFallback: 'Thai',
  },
  {
    id: 'france',
    countryCode: 'FR',
    currentTripLocation: 'France',
    targetLanguage: 'fr-FR',
    titleKey: 'onboarding.destination.france',
    titleFallback: 'France',
    subtitleKey: 'onboarding.destination.franceSubtitle',
    subtitleFallback: 'French allergy card',
    languageLabelKey: 'travelerCard.language.french',
    languageLabelFallback: 'French',
  },
  {
    id: 'united-states',
    countryCode: 'US',
    currentTripLocation: 'United States',
    targetLanguage: 'en-US',
    titleKey: 'onboarding.destination.unitedStates',
    titleFallback: 'United States',
    subtitleKey: 'onboarding.destination.unitedStatesSubtitle',
    subtitleFallback: 'English allergy card',
    languageLabelKey: 'travelerCard.language.english',
    languageLabelFallback: 'English',
  },
];

export const DEFAULT_ONBOARDING_DESTINATION = ONBOARDING_DESTINATIONS[0];
