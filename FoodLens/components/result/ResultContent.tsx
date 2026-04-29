import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AlertCircle, Sparkles } from 'lucide-react-native';
import TravelerAllergyCard from '../TravelerAllergyCard';
import AiSummaryCard from './resultContent/components/AiSummaryCard';
import ResultContentFiller from './resultContent/components/ResultContentFiller';
import ResultIngredientsSection from './resultContent/components/ResultIngredientsSection';
import ResultMetaHeader from './resultContent/components/ResultMetaHeader';
import { useResultContentModel } from './resultContent/hooks/useResultContentModel';
import { resultContentStyles as styles } from './resultContent/styles';
import { ResultContentProps } from './resultContent/types';
import {
    getHomeDashboardColors,
    getHomeDashboardSignalColors,
    type HomeDashboardColors,
} from '@/features/home/components/homeDashboardTokens';

const resolveDecisionColors = (
    decisionVariant: 'ok' | 'ask' | 'avoid',
    colors: HomeDashboardColors
): {
    badgeBackgroundColor: string;
    badgeBorderColor: string;
    badgeTextColor: string;
    actionTextColor: string;
    cardBackgroundColor: string;
    cardBorderColor: string;
    helperBackgroundColor: string;
    helperTextColor: string;
} => {
    const signalColors = getHomeDashboardSignalColors(colors);

    if (decisionVariant === 'ok') {
        const signal = signalColors.SAFE;
        return {
            badgeBackgroundColor: signal.background,
            badgeBorderColor: signal.background,
            badgeTextColor: signal.text,
            actionTextColor: signal.text,
            cardBackgroundColor: colors.pearlIvory,
            cardBorderColor: signal.background,
            helperBackgroundColor: signal.background,
            helperTextColor: signal.text,
        };
    }

    if (decisionVariant === 'ask') {
        const signal = signalColors.CAUTION;
        return {
            badgeBackgroundColor: signal.background,
            badgeBorderColor: signal.background,
            badgeTextColor: signal.text,
            actionTextColor: signal.text,
            cardBackgroundColor: colors.paperMuted,
            cardBorderColor: signal.background,
            helperBackgroundColor: signal.background,
            helperTextColor: signal.text,
        };
    }

    const signal = signalColors.DANGER;
    return {
        badgeBackgroundColor: signal.background,
        badgeBorderColor: signal.background,
        badgeTextColor: signal.text,
        actionTextColor: signal.text,
        cardBackgroundColor: colors.paperMuted,
        cardBorderColor: signal.background,
        helperBackgroundColor: signal.background,
        helperTextColor: signal.text,
    };
};

export function ResultContent({
    result,
    locationData,
    imageSource,
    timestamp,
    onOpenBreakdown,
    onDatePress,
    t,
    locale,
}: ResultContentProps) {
    const {
        decisionVariant,
        safetyLabel,
        actionLabel,
        decisionChecklistItems,
        hasAllergens,
        colorScheme,
        theme,
        locationText,
        formattedTimestamp,
        localizedFoodName,
        localizedIngredients,
        localizedSummary,
    } = useResultContentModel(
        result,
        locationData,
        timestamp,
        t,
        locale
    );
    const dashboardColors = getHomeDashboardColors(colorScheme);
    const decisionColors = resolveDecisionColors(decisionVariant, dashboardColors);

    return (
        <View style={[styles.sheetContainer, { backgroundColor: theme.background }]}>
            <View style={styles.handleContainer}>
                <View style={[styles.handle, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.contentPadding}>
                <View
                    style={[
                        styles.decisionCard,
                        {
                            backgroundColor: decisionColors.cardBackgroundColor,
                            borderColor: decisionColors.cardBorderColor,
                        },
                    ]}
                >
                    <View style={styles.decisionCardHeader}>
                        <View
                            style={[
                                styles.decisionStatusBadge,
                                {
                                    backgroundColor: decisionColors.badgeBackgroundColor,
                                    borderColor: decisionColors.badgeBorderColor,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.decisionStatusText,
                                    { color: decisionColors.badgeTextColor },
                                ]}
                            >
                                {safetyLabel}
                            </Text>
                        </View>

                        {hasAllergens ? (
                            <View
                                style={[
                                    styles.decisionHelperBadge,
                                    {
                                        backgroundColor: decisionColors.helperBackgroundColor,
                                        borderColor: decisionColors.badgeBorderColor,
                                    },
                                ]}
                            >
                                <AlertCircle size={14} color={decisionColors.helperTextColor} />
                                <Text
                                    style={[
                                        styles.decisionHelperBadgeText,
                                        { color: decisionColors.helperTextColor },
                                    ]}
                                >
                                    {t('result.decision.trigger', 'TRIGGER FOUND')}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <Text
                        style={[
                            styles.decisionActionText,
                            { color: decisionColors.actionTextColor },
                        ]}
                    >
                        {actionLabel}
                    </Text>

                    <View style={styles.decisionChecklist}>
                        {decisionChecklistItems.map((item) => (
                            <View key={item} style={styles.decisionChecklistItem}>
                                <View
                                    style={[
                                        styles.decisionChecklistBullet,
                                        { backgroundColor: decisionColors.actionTextColor },
                                    ]}
                                />
                                <Text style={[styles.decisionChecklistText, { color: theme.textPrimary }]}>
                                    {item}
                                </Text>
                            </View>
                        ))}
                    </View>

                    <View style={styles.decisionFooter}>
                        <TouchableOpacity
                            onPress={onOpenBreakdown}
                            style={[
                                styles.decisionPrimaryButton,
                                {
                                    borderColor: decisionColors.cardBorderColor,
                                    backgroundColor: theme.background,
                                },
                            ]}
                        >
                            <Sparkles size={16} color={decisionColors.actionTextColor} />
                            <Text
                                style={[
                                    styles.decisionPrimaryButtonText,
                                    { color: decisionColors.actionTextColor },
                                ]}
                            >
                                {t('result.meta.breakdown', 'Why this result')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <ResultMetaHeader
                    foodName={localizedFoodName}
                    locationText={locationText}
                    formattedTimestamp={formattedTimestamp}
                    theme={theme}
                    onDatePress={onDatePress}
                />

                {localizedSummary ? (
                    <AiSummaryCard
                        colorScheme={colorScheme}
                        theme={theme}
                        summary={localizedSummary}
                        locale={locale}
                        t={t}
                    />
                ) : null}

                <View style={styles.travelerCardSection}>
                    <TravelerAllergyCard
                        countryCode={locationData?.isoCountryCode}
                        aiTranslation={result.translationCard}
                    />
                </View>

                <ResultIngredientsSection ingredients={localizedIngredients} theme={theme} t={t} />
            </View>

            <ResultContentFiller backgroundColor={theme.background} />
        </View>
    );
}
