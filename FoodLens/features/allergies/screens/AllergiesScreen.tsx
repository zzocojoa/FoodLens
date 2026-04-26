import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import {
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { completeTopLevelTabSwitchTrace } from '../../../components/navigation/tabSwitchTrace';
import TopLevelScreenShell, {
    getTopLevelScreenBottomPadding,
} from '../../../components/navigation/TopLevelScreenShell';
import { ALLERGEN_TERMS } from '../../../services/staticTranslations';
import { HomeBackgroundAtmosphere } from '../../home/components/HomeBackgroundAtmosphere';
import AllergiesConciergeRail from '../components/AllergiesConciergeRail';
import {
    allergiesDashboardColors,
    type AllergiesDashboardTone,
} from '../components/allergiesDashboardTokens';
import {
    allergiesDashboardStyles,
} from '../components/allergiesDashboardStyles';
import AllergiesEmptyHero from '../components/AllergiesEmptyHero';
import {
    AllergiesPassportHero,
    type AllergiesPassportCardCopy,
    type AllergiesPassportHeroState,
    type AllergiesPassportSummary,
} from '../components/AllergiesPassportHero';
import {
    AllergiesRiskLedger,
    type AllergiesRiskLedgerSection,
} from '../components/AllergiesRiskLedger';
import AllergiesTravelerCardModal from '../components/AllergiesTravelerCardModal';
import { AllergiesTravelerPassportCard } from '../components/AllergiesTravelerPassportCard';
import { ALLERGIES_COPY } from '../constants/allergies.constants';
import { useAllergiesData } from '../hooks/useAllergiesData';
import { translateAllergenToKorean } from '../utils/translateAllergen';
import { useTravelerAllergyCardModel } from '@/components/travelerAllergyCard/hooks/useTravelerAllergyCardModel';
import { TravelerAllergensProvider } from '@/components/travelerAllergyCard/hooks/useTravelerAllergens';
import { AllergySeverity } from '@/features/profile/types/profile.types';
import {
    getRestrictionDefaultLabel,
    resolveRestrictionDisplayName,
} from '@/features/profile/utils/profileSuggestions';
import { useI18n } from '@/features/i18n';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { markHomeNavigationTrace } from '@/features/home/services/homeNavigationTrace';

type TranslationFunction = (key: string, fallback?: string) => string;

type LedgerItem = Readonly<{
    id: string;
    primaryLabel: string;
    secondaryLabel: string;
}>;

type TravelerCardViewModel = Readonly<{
    finalMessage: string;
    isPersonalized: boolean;
    languageLabel: string;
}>;

type AllergiesScreenContentProps = Readonly<{
    allergies: string[];
    dietaryRestrictions: string[];
    severityMap: Record<string, AllergySeverity>;
    loading: boolean;
}>;

const AllergiesScreenStatusBar = (): React.JSX.Element => {
    const colorScheme = useColorScheme() ?? 'light';

    return <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />;
};

const TRAVELER_ALLERGIES_PREFIX = '⚠️ My Allergies:';

const replaceCountTemplate = (template: string, count: number): string => {
    return template.replace('{count}', String(count));
};

const getAllergiesSummary = (
    allergies: string[],
    dietaryRestrictions: string[],
    severityMap: Record<string, AllergySeverity>,
): AllergiesPassportSummary => {
    const allergySeverities = allergies.map((item) => severityMap[item] ?? 'moderate');
    const dietaryRestrictionSeverities = dietaryRestrictions.flatMap((item) => {
        const severity = severityMap[item];

        return typeof severity === 'undefined' ? [] : [severity];
    });
    const severityEntries = [...allergySeverities, ...dietaryRestrictionSeverities];
    const severeCount = severityEntries.filter((severity) => severity === 'severe').length;
    const mildCount = severityEntries.filter((severity) => severity === 'mild').length;
    const moderateCount = severityEntries.filter((severity) => severity === 'moderate').length;

    return {
        trackedItemCount: allergies.length + dietaryRestrictions.length,
        severeCount,
        moderateCount,
        mildCount,
        dietaryRestrictionCount: dietaryRestrictions.length,
        allergyCount: allergies.length,
    };
};

const resolveTravelerLanguageLabel = (
    language: string,
    t: TranslationFunction,
): string => {
    const normalized = language.trim().toLowerCase();

    if (normalized === 'korean' || normalized === 'kr' || normalized === 'ko' || normalized === 'ko-kr') {
        return t('travelerCard.language.korean', '한국어');
    }

    if (normalized === 'english' || normalized === 'us' || normalized === 'en' || normalized === 'en-us') {
        return t('travelerCard.language.english', '영어');
    }

    if (normalized === 'japanese' || normalized === 'jp' || normalized === 'ja' || normalized === 'ja-jp') {
        return t('travelerCard.language.japanese', '일본어');
    }

    if (normalized === 'chinese' || normalized === 'cn' || normalized === 'zh' || normalized === 'zh-hans') {
        return t('travelerCard.language.chineseSimplified', '중국어 간체');
    }

    if (
        normalized === 'traditional chinese' ||
        normalized === 'zh-hant' ||
        normalized === 'zh-tw' ||
        normalized === 'tw'
    ) {
        return t('travelerCard.language.chineseTraditional', '중국어 번체');
    }

    if (normalized === 'thai' || normalized === 'th' || normalized === 'th-th') {
        return t('travelerCard.language.thai', '태국어');
    }

    if (normalized === 'vietnamese' || normalized === 'vn' || normalized === 'vi' || normalized === 'vi-vn') {
        return t('travelerCard.language.vietnamese', '베트남어');
    }

    if (normalized === 'indonesian' || normalized === 'id' || normalized === 'id-id') {
        return t('travelerCard.language.indonesian', '인도네시아어');
    }

    if (normalized === 'french' || normalized === 'fr' || normalized === 'fr-fr') {
        return t('travelerCard.language.french', '프랑스어');
    }

    if (normalized === 'italian' || normalized === 'it' || normalized === 'it-it') {
        return t('travelerCard.language.italian', '이탈리아어');
    }

    if (normalized === 'spanish' || normalized === 'es' || normalized === 'es-es') {
        return t('travelerCard.language.spanish', '스페인어');
    }

    if (normalized === 'german' || normalized === 'de' || normalized === 'de-de') {
        return t('travelerCard.language.german', '독일어');
    }

    return language;
};

const resolveTravelerFinalMessage = (
    message: string,
    t: TranslationFunction,
): string => {
    return message.replace(
        TRAVELER_ALLERGIES_PREFIX,
        t('travelerCard.allergiesLabel', '⚠️ My allergies:'),
    );
};

const resolveTravelerCardViewModel = (
    finalMessage: string,
    language: string,
    t: TranslationFunction,
): TravelerCardViewModel => {
    return {
        finalMessage: resolveTravelerFinalMessage(finalMessage, t),
        isPersonalized: hasPersonalizedTravelerMessage(finalMessage),
        languageLabel: resolveTravelerLanguageLabel(language, t),
    };
};

const getHeroState = (
    loading: boolean,
    hasSavedItems: boolean,
    travelerCardViewModel: TravelerCardViewModel | null,
): AllergiesPassportHeroState => {
    if (loading) {
        return 'loading';
    }

    if (!hasSavedItems) {
        return 'empty';
    }

    if (travelerCardViewModel === null) {
        return 'card-unavailable';
    }

    if (travelerCardViewModel.isPersonalized) {
        return 'personalized';
    }

    return 'generic';
};

const hasPersonalizedTravelerMessage = (message: string): boolean => {
    return message.includes(TRAVELER_ALLERGIES_PREFIX);
};

const getRailTone = (state: AllergiesPassportHeroState): AllergiesDashboardTone => {
    if (state === 'personalized') {
        return 'safe';
    }

    if (state === 'generic') {
        return 'accent';
    }

    if (state === 'card-unavailable') {
        return 'danger';
    }

    if (state === 'empty') {
        return 'caution';
    }

    return 'neutral';
};

const getRailStatusLabel = (
    state: AllergiesPassportHeroState,
    t: TranslationFunction,
): string => {
    if (state === 'personalized') {
        return t('allergies.rail.travelerReady', 'Traveler-ready');
    }

    if (state === 'generic') {
        return t('allergies.hero.state.generic', 'Translated');
    }

    if (state === 'card-unavailable') {
        return t('allergies.hero.state.unavailable', 'Unavailable');
    }

    if (state === 'empty') {
        return t('allergies.rail.travelerNotReady', 'Not ready yet');
    }

    return t('allergies.hero.state.loading', 'Syncing');
};

const getSavedCountLabel = (
    trackedItemCount: number,
    t: TranslationFunction,
): string => {
    return replaceCountTemplate(
        t('allergies.rail.savedCountTemplate', '{count} saved items'),
        trackedItemCount,
    );
};

const getPrimaryLabel = (value: string, t: TranslationFunction): string => {
    const ingredientLabel = resolveRestrictionDisplayName(value, t);
    const defaultLabel = getRestrictionDefaultLabel(value);
    if (ingredientLabel !== value) return ingredientLabel;
    if (defaultLabel !== value) return t(`profile.allergen.${value}`, defaultLabel);

    const staticLabel = translateAllergenToKorean(value, ALLERGEN_TERMS);
    if (staticLabel !== value) return staticLabel;
    return t(`profile.allergen.${value}`, defaultLabel);
};

const getSecondaryLabel = (value: string): string => {
    return getRestrictionDefaultLabel(value);
};

const getSeverityLabel = (
    severity: AllergySeverity,
    t: TranslationFunction,
): string => {
    if (severity === 'severe') {
        return t('onboarding.severity.severe', 'Severe');
    }

    if (severity === 'mild') {
        return t('onboarding.severity.mild', 'Mild');
    }

    return t('onboarding.severity.moderate', 'Moderate');
};

const getDietaryRestrictionLedgerItems = (
    values: string[],
    severityMap: Record<string, AllergySeverity>,
    t: TranslationFunction,
): LedgerItem[] => {
    return values.map((value) => {
        const severity = severityMap[value];
        const secondaryLabel = getSecondaryLabel(value);

        return {
            id: value,
            primaryLabel: getPrimaryLabel(value, t),
            secondaryLabel: typeof severity === 'undefined'
                ? secondaryLabel
                : `${getSeverityLabel(severity, t)} · ${secondaryLabel}`,
        };
    });
};

const getSeverityItems = (
    allergies: string[],
    severityMap: Record<string, AllergySeverity>,
    severity: AllergySeverity,
    t: TranslationFunction,
): LedgerItem[] => {
    return allergies
        .filter((item) => {
            if (severity === 'moderate') {
                return severityMap[item] !== 'severe' && severityMap[item] !== 'mild';
            }

            return severityMap[item] === severity;
        })
        .map((item) => ({
            id: item,
            primaryLabel: getPrimaryLabel(item, t),
            secondaryLabel: getSecondaryLabel(item),
        }));
};

const getLedgerSections = (
    allergies: string[],
    dietaryRestrictions: string[],
    severityMap: Record<string, AllergySeverity>,
    t: TranslationFunction,
): AllergiesRiskLedgerSection[] => {
    return [
        {
            kind: 'severe',
            title: t('allergies.ledger.severe', 'Severe'),
            items: getSeverityItems(allergies, severityMap, 'severe', t),
        },
        {
            kind: 'moderate',
            title: t('allergies.ledger.moderate', 'Moderate'),
            items: getSeverityItems(allergies, severityMap, 'moderate', t),
        },
        {
            kind: 'mild',
            title: t('allergies.ledger.mild', 'Mild'),
            items: getSeverityItems(allergies, severityMap, 'mild', t),
        },
        {
            kind: 'dietaryRestrictions',
            title: t('allergies.ledger.restrictions', 'Restrictions'),
            items: getDietaryRestrictionLedgerItems(dietaryRestrictions, severityMap, t),
        },
    ];
};

const getTravelerCardCopy = (
    travelerCardViewModel: TravelerCardViewModel | null,
    t: TranslationFunction,
): AllergiesPassportCardCopy | undefined => {
    if (travelerCardViewModel === null) {
        return undefined;
    }

    return {
        headline: t('allergies.hero.passportTitle', 'Traveler Passport'),
        message: travelerCardViewModel.finalMessage,
        languageLabel: travelerCardViewModel.languageLabel,
        supportingLabel: t('allergies.hero.conciergeSubtitle', 'Show this card to restaurant staff when ordering.'),
    };
};

export default function AllergiesScreen(): React.JSX.Element {
    const {
        allergies,
        dietaryRestrictions,
        severityMap,
        loading,
    } = useAllergiesData();
    const travelerAllergens = React.useMemo(
        () => [...allergies, ...dietaryRestrictions],
        [allergies, dietaryRestrictions],
    );

    return (
        <TravelerAllergensProvider allergens={travelerAllergens}>
            <AllergiesScreenContent
                allergies={allergies}
                dietaryRestrictions={dietaryRestrictions}
                severityMap={severityMap}
                loading={loading}
            />
        </TravelerAllergensProvider>
    );
}

const AllergiesScreenContent = ({
    allergies,
    dietaryRestrictions,
    severityMap,
    loading,
}: AllergiesScreenContentProps): React.JSX.Element => {
    const router = useRouter();
    const isFocused = useIsFocused();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const travelerCardModel = useTravelerAllergyCardModel(undefined, undefined);
    const [isTravelerCardExpanded, setIsTravelerCardExpanded] = React.useState(false);
    const hasMarkedFirstContentRef = React.useRef(false);

    React.useEffect(() => {
        markHomeNavigationTrace('allergies', 'screen_mount');
    }, []);

    const summary = React.useMemo(
        () => getAllergiesSummary(allergies, dietaryRestrictions, severityMap),
        [allergies, dietaryRestrictions, severityMap],
    );
    const hasSavedItems = summary.trackedItemCount > 0;
    const travelerCardViewModel = React.useMemo(() => {
        if (travelerCardModel === null) {
            return null;
        }

        return resolveTravelerCardViewModel(
            travelerCardModel.finalMessage,
            travelerCardModel.displayData.language,
            t,
        );
    }, [t, travelerCardModel]);
    const heroState = React.useMemo(
        () => getHeroState(loading, hasSavedItems, travelerCardViewModel),
        [hasSavedItems, loading, travelerCardViewModel],
    );
    const heroCardCopy = React.useMemo(
        () => getTravelerCardCopy(travelerCardViewModel, t),
        [t, travelerCardViewModel],
    );
    const ledgerSections = React.useMemo(
        () => getLedgerSections(allergies, dietaryRestrictions, severityMap, t),
        [allergies, dietaryRestrictions, severityMap, t],
    );
    const railTone = React.useMemo(
        () => getRailTone(heroState),
        [heroState],
    );
    const railStatusLabel = React.useMemo(
        () => getRailStatusLabel(heroState, t),
        [heroState, t],
    );
    const savedCountLabel = React.useMemo(
        () => getSavedCountLabel(summary.trackedItemCount, t),
        [summary.trackedItemCount, t],
    );
    const homeContentBottomPadding = getTopLevelScreenBottomPadding(insets.bottom, 24);
    const isAllergiesReady = !loading || summary.trackedItemCount > 0;

    const handleEditProfile = React.useCallback(() => {
        router.push('/health-profile' as never);
    }, [router]);

    const handleOpenTravelerCard = React.useCallback(() => {
        setIsTravelerCardExpanded(true);
    }, []);

    const handleCloseTravelerCard = React.useCallback(() => {
        setIsTravelerCardExpanded(false);
    }, []);

    const modalCardState =
        heroState === 'personalized' || heroState === 'generic' ? heroState : 'generic';

    React.useEffect(() => {
        if (!isFocused || !isAllergiesReady) {
            return;
        }

        if (!hasMarkedFirstContentRef.current) {
            hasMarkedFirstContentRef.current = true;
            markHomeNavigationTrace('allergies', 'first_content');
        }

        completeTopLevelTabSwitchTrace({
            target: 'allergies',
            details: {
                hasSavedItems,
                heroState,
                trackedItemCount: summary.trackedItemCount,
            },
        });
    }, [hasSavedItems, heroState, isAllergiesReady, isFocused, summary.trackedItemCount]);

    return (
        <TopLevelScreenShell
            activeItem="allergies"
            backgroundColor={allergiesDashboardColors.paper}
            hideNav={false}
        >
            <View style={screenStyles.container}>
                <HomeBackgroundAtmosphere />
                <AllergiesScreenStatusBar />
                <Stack.Screen options={{ headerShown: false }} />

                <SafeAreaView style={screenStyles.safeArea} edges={['top']}>
                    <ScrollView
                        contentInsetAdjustmentBehavior="automatic"
                        contentContainerStyle={[
                            allergiesDashboardStyles.scrollContent,
                            screenStyles.scrollContent,
                            { paddingBottom: homeContentBottomPadding },
                        ]}
                        showsVerticalScrollIndicator={false}
                    >
                        <AllergiesConciergeRail
                            title={t(ALLERGIES_COPY.title.key, ALLERGIES_COPY.title.fallback)}
                            description={t(ALLERGIES_COPY.description.key, ALLERGIES_COPY.description.fallback)}
                            savedCountLabel={savedCountLabel}
                            statusLabel={railStatusLabel}
                            statusTone={railTone}
                        />

                        {heroState === 'empty' ? (
                            <AllergiesEmptyHero
                                eyebrow={t('allergies.rail.travelerNotReady', 'Not ready yet')}
                                title={t('allergies.summary.emptyTitle', 'No saved items yet')}
                                description={t('allergies.summary.emptyHint', 'Add your allergies before analyzing food.')}
                                actionLabel={t('allergies.action.addAllergyInfo', 'Add allergy info')}
                                onActionPress={handleEditProfile}
                            />
                        ) : (
                            <AllergiesPassportHero
                                state={heroState}
                                summary={summary}
                                cardCopy={heroCardCopy}
                                onOpenTravelerCard={handleOpenTravelerCard}
                            />
                        )}

                        {!loading && hasSavedItems ? (
                            <AllergiesRiskLedger
                                title={t('allergies.ledger.title', 'Risk Ledger')}
                                meta={t('allergies.ledger.meta', 'Severity · restrictions')}
                                sections={ledgerSections}
                                emptyTitle={t('allergies.ledger.empty', 'Nothing tracked yet')}
                                emptyDescription={t('allergies.summary.emptyHint', 'Add your allergies before analyzing food.')}
                            />
                        ) : null}
                    </ScrollView>
                </SafeAreaView>
            </View>

            <AllergiesTravelerCardModal
                visible={isTravelerCardExpanded}
                onClose={handleCloseTravelerCard}
            >
                <AllergiesTravelerPassportCard
                    state={modalCardState}
                    copy={heroCardCopy ?? {}}
                />
            </AllergiesTravelerCardModal>
        </TopLevelScreenShell>
    );
};

const screenStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: allergiesDashboardColors.paper,
    },
    safeArea: {
        flex: 1,
        backgroundColor: allergiesDashboardColors.paper,
    },
    scrollContent: {
        paddingTop: 6,
    },
});
