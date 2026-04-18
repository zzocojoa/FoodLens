import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import TravelerAllergyCard from '../../../components/TravelerAllergyCard';
import TopLevelScreenShell, {
    getTopLevelScreenBottomPadding,
} from '../../../components/navigation/TopLevelScreenShell';
import { Colors } from '../../../constants/theme';
import { useColorScheme } from '../../../hooks/use-color-scheme';
import AllergiesHeader from '../components/AllergiesHeader';
import AllergyListSection from '../components/AllergyListSection';
import { ALLERGIES_COPY } from '../constants/allergies.constants';
import { useAllergiesData } from '../hooks/useAllergiesData';
import { allergiesStyles as styles } from '../styles/allergiesStyles';
import { useI18n } from '@/features/i18n';
import { AllergySeverity } from '@/features/profile/types/profile.types';

type AllergiesSummary = {
    trackedItemCount: number;
    severeCount: number;
    moderateCount: number;
    mildCount: number;
    restrictionCount: number;
};

const replaceCountTemplate = (template: string, count: number): string => {
    return template.replace('{count}', String(count));
};

const getAllergiesSummary = (
    allergies: string[],
    dietaryRestrictions: string[],
    severityMap: Record<string, AllergySeverity>,
): AllergiesSummary => {
    const severeCount = allergies.filter((item) => severityMap[item] === 'severe').length;
    const mildCount = allergies.filter((item) => severityMap[item] === 'mild').length;
    const moderateCount = allergies.length - severeCount - mildCount;

    return {
        trackedItemCount: allergies.length + dietaryRestrictions.length,
        severeCount,
        moderateCount,
        mildCount,
        restrictionCount: dietaryRestrictions.length,
    };
};

export default function AllergiesScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { t } = useI18n();
    const { allergies, dietaryRestrictions, severityMap, loading } = useAllergiesData();
    const [isTravelerCardExpanded, setIsTravelerCardExpanded] = React.useState(false);
    const summary = React.useMemo(
        () => getAllergiesSummary(allergies, dietaryRestrictions, severityMap),
        [allergies, dietaryRestrictions, severityMap],
    );
    const hasSavedItems = summary.trackedItemCount > 0;
    const summaryTitle = loading
        ? t('allergies.loading.title', 'Loading saved allergies')
        : hasSavedItems
          ? replaceCountTemplate(
                t('allergies.summary.itemsToAvoidTemplate', 'Avoid {count} items'),
                summary.trackedItemCount,
            )
          : t('allergies.summary.emptyTitle', 'No saved items yet');
    const summaryChips = React.useMemo(() => {
        if (loading || !hasSavedItems) {
            return [];
        }

        const chips: string[] = [];

        if (summary.severeCount > 0) {
            chips.push(
                replaceCountTemplate(
                    t('allergies.summary.severeTemplate', 'Severe {count}'),
                    summary.severeCount,
                ),
            );
        }

        if (summary.moderateCount > 0) {
            chips.push(
                replaceCountTemplate(
                    t('allergies.summary.moderateTemplate', 'Moderate {count}'),
                    summary.moderateCount,
                ),
            );
        }

        if (summary.mildCount > 0) {
            chips.push(
                replaceCountTemplate(
                    t('allergies.summary.mildTemplate', 'Mild {count}'),
                    summary.mildCount,
                ),
            );
        }

        if (summary.restrictionCount > 0) {
            chips.push(
                replaceCountTemplate(
                    t('allergies.summary.restrictionsTemplate', 'Restrictions {count}'),
                    summary.restrictionCount,
                ),
            );
        }

        return chips;
    }, [hasSavedItems, loading, summary, t]);
    const handleEditProfile = React.useCallback(() => {
        router.push('/health-profile' as never);
    }, [router]);
    const handleOpenTravelerCard = React.useCallback(() => {
        setIsTravelerCardExpanded(true);
    }, []);
    const handleCloseTravelerCard = React.useCallback(() => {
        setIsTravelerCardExpanded(false);
    }, []);

    return (
        <TopLevelScreenShell
            activeItem="allergies"
            backgroundColor={theme.background}
            hideNav={false}
        >
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
                <Stack.Screen options={{ headerShown: false }} />

                <SafeAreaView style={{ flex: 1 }}>
                    <AllergiesHeader
                        title={t(ALLERGIES_COPY.title.key, ALLERGIES_COPY.title.fallback)}
                        theme={theme}
                    />

                    <ScrollView
                        contentContainerStyle={[
                            styles.content,
                            { paddingBottom: getTopLevelScreenBottomPadding(insets.bottom, 0) },
                        ]}
                    >
                        {hasSavedItems && !loading ? (
                            <View style={styles.passportHeroSection}>
                                <View style={styles.passportHeroHeader}>
                                    <View style={styles.passportHeroLead}>
                                        <Text style={[styles.passportHeroEyebrow, { color: theme.textSecondary }]}>
                                            {t('allergies.travelerCardPreviewEyebrow', 'Travel utility')}
                                        </Text>
                                        <Text style={[styles.passportHeroTitle, { color: theme.textPrimary }]}>
                                            {t(
                                                ALLERGIES_COPY.travelerCardPreviewTitle.key,
                                                ALLERGIES_COPY.travelerCardPreviewTitle.fallback,
                                            )}
                                        </Text>
                                        <Text style={[styles.passportHeroDescription, { color: theme.textSecondary }]}>
                                            {t(
                                                'allergies.travelerHeroDescription',
                                                'Open this screen and show it directly to restaurant staff.',
                                            )}
                                        </Text>
                                    </View>

                                    <TouchableOpacity
                                        style={[styles.inlineEditButton, { borderColor: theme.border }]}
                                        onPress={handleEditProfile}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.inlineEditButtonText, { color: theme.textPrimary }]}>
                                            {t('allergies.action.editSecondary', 'Edit')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <TravelerAllergyCard
                                    countryCode={undefined}
                                    aiTranslation={undefined}
                                />

                                <View style={styles.passportHeroFooter}>
                                    <TouchableOpacity
                                        style={[styles.primaryTravelerButton, { backgroundColor: theme.textPrimary }]}
                                        onPress={handleOpenTravelerCard}
                                        activeOpacity={0.86}
                                    >
                                        <Text style={[styles.primaryTravelerButtonText, { color: theme.background }]}>
                                            {t('allergies.action.openTravelerCard', 'View larger')}
                                        </Text>
                                    </TouchableOpacity>

                                    {summaryChips.length > 0 && (
                                        <View style={styles.summaryChipRow}>
                                            {summaryChips.map((chip) => (
                                                <View
                                                    key={chip}
                                                    style={[styles.summaryChip, { backgroundColor: theme.background }]}
                                                >
                                                    <Text style={[styles.summaryChipText, { color: theme.textSecondary }]}>
                                                        {chip}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            </View>
                        ) : (
                            <View style={[styles.topfold, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <View style={styles.topfoldRow}>
                                    <View style={styles.summaryContent}>
                                        <Text style={[styles.summaryTitle, { color: theme.textPrimary }]}>
                                            {summaryTitle}
                                        </Text>
                                        <Text style={[styles.summaryHint, { color: theme.textSecondary }]}>
                                            {t(
                                                'allergies.summary.emptyHint',
                                                'Add your allergies before analyzing food.',
                                            )}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        <AllergyListSection
                            loading={loading}
                            allergies={allergies}
                            dietaryRestrictions={dietaryRestrictions}
                            severityMap={severityMap}
                            theme={theme}
                            onPressEdit={handleEditProfile}
                        />
                    </ScrollView>
                </SafeAreaView>
            </View>

            <Modal
                transparent={true}
                animationType="fade"
                visible={isTravelerCardExpanded}
                onRequestClose={handleCloseTravelerCard}
            >
                <View style={styles.travelerModalBackdrop}>
                    <SafeAreaView style={styles.travelerModalSafeArea}>
                        <View style={styles.travelerModalHeader}>
                            <TouchableOpacity
                                style={styles.travelerModalCloseButton}
                                onPress={handleCloseTravelerCard}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.travelerModalCloseText}>
                                    {t('allergies.action.closeTravelerCard', 'Close')}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.travelerModalCardFrame}>
                            <TravelerAllergyCard
                                countryCode={undefined}
                                aiTranslation={undefined}
                            />
                        </View>
                    </SafeAreaView>
                </View>
            </Modal>
        </TopLevelScreenShell>
    );
}
