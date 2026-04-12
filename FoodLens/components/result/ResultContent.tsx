import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AlertCircle, Sparkles } from 'lucide-react-native';
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
    cardBackgroundColor: string;
    cardBorderColor: string;
    helperBackgroundColor: string;
    helperTextColor: string;
} => {
    if (decisionVariant === 'ok') {
        return {
            badgeBackgroundColor: '#ECFDF5',
            badgeBorderColor: '#D1FAE5',
            badgeTextColor: '#047857',
            actionTextColor: '#065F46',
            cardBackgroundColor: '#F7FFFB',
            cardBorderColor: '#BBF7D0',
            helperBackgroundColor: '#ECFDF5',
            helperTextColor: '#047857',
        };
    }

    if (decisionVariant === 'ask') {
        return {
            badgeBackgroundColor: '#FEF3C7',
            badgeBorderColor: '#FDE68A',
            badgeTextColor: '#B45309',
            actionTextColor: '#92400E',
            cardBackgroundColor: '#FFFDF4',
            cardBorderColor: '#FDE68A',
            helperBackgroundColor: '#FEF3C7',
            helperTextColor: '#B45309',
        };
    }

    return {
        badgeBackgroundColor: '#FFF1F2',
        badgeBorderColor: '#FDA4AF',
        badgeTextColor: '#BE123C',
        actionTextColor: '#9F1239',
        cardBackgroundColor: '#FFF7F8',
        cardBorderColor: '#FDA4AF',
        helperBackgroundColor: '#FFF1F2',
        helperTextColor: '#BE123C',
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
        decisionSupportText,
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
    const decisionColors = resolveDecisionColors(decisionVariant);

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

                    <Text style={[styles.decisionSupportText, { color: theme.textPrimary }]}>
                        {decisionSupportText}
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
                    t={t}
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

                {hasAllergens && <AllergyAlertCard colorScheme={colorScheme} t={t} />}

                <ResultIngredientsSection ingredients={localizedIngredients} theme={theme} t={t} />
            </View>

            <ResultContentFiller backgroundColor={theme.background} />
        </View>
    );
}
