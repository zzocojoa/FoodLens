import React from 'react';
import { Text, View } from 'react-native';
import TravelerAllergyCard from '../TravelerAllergyCard';
import AllergyAlertCard from './resultContent/components/AllergyAlertCard';
import AiSummaryCard from './resultContent/components/AiSummaryCard';
import ResultContentFiller from './resultContent/components/ResultContentFiller';
import ResultIngredientsSection from './resultContent/components/ResultIngredientsSection';
import ResultMetaHeader from './resultContent/components/ResultMetaHeader';
import { useResultContentModel } from './resultContent/hooks/useResultContentModel';
import { resultContentStyles as styles } from './resultContent/styles';
import { ResultContentProps } from './resultContent/types';

const resolveDecisionColors = (
    decisionVariant: 'ok' | 'ask' | 'avoid'
): {
    badgeBackgroundColor: string;
    badgeBorderColor: string;
    badgeTextColor: string;
    actionTextColor: string;
} => {
    if (decisionVariant === 'ok') {
        return {
            badgeBackgroundColor: '#ECFDF5',
            badgeBorderColor: '#D1FAE5',
            badgeTextColor: '#047857',
            actionTextColor: '#065F46',
        };
    }

    if (decisionVariant === 'ask') {
        return {
            badgeBackgroundColor: '#FEF3C7',
            badgeBorderColor: '#FDE68A',
            badgeTextColor: '#B45309',
            actionTextColor: '#92400E',
        };
    }

    return {
        badgeBackgroundColor: '#FFF1F2',
        badgeBorderColor: '#FDA4AF',
        badgeTextColor: '#BE123C',
        actionTextColor: '#9F1239',
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
    const decisionColors = resolveDecisionColors(decisionVariant);

    return (
        <View style={[styles.sheetContainer, { backgroundColor: theme.background }]}> 
            <View style={styles.handleContainer}>
                <View style={[styles.handle, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.contentPadding}>
                <View style={styles.decisionSection}>
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

                    <Text
                        style={[
                            styles.decisionActionText,
                            { color: decisionColors.actionTextColor },
                        ]}
                    >
                        {actionLabel}
                    </Text>
                </View>

                {localizedSummary ? (
                    <AiSummaryCard
                        colorScheme={colorScheme}
                        theme={theme}
                        summary={localizedSummary}
                        locale={locale}
                        t={t}
                    />
                ) : null}

                <ResultMetaHeader
                    foodName={localizedFoodName}
                    confidence={result.confidence}
                    locationText={locationText}
                    formattedTimestamp={formattedTimestamp}
                    theme={theme}
                    onOpenBreakdown={onOpenBreakdown}
                    onDatePress={onDatePress}
                    t={t}
                />

                {hasAllergens && <AllergyAlertCard colorScheme={colorScheme} t={t} />}

                <ResultIngredientsSection ingredients={localizedIngredients} theme={theme} t={t} />

                <View style={{ marginTop: 24 }}>
                    <TravelerAllergyCard
                        countryCode={locationData?.isoCountryCode}
                        aiTranslation={result.translationCard}
                    />
                </View>
            </View>

            <ResultContentFiller backgroundColor={theme.background} />
        </View>
    );
}
