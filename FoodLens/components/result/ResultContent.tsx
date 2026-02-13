import React from 'react';
import { View } from 'react-native';
import TravelerAllergyCard from '../TravelerAllergyCard';
import AllergyAlertCard from './resultContent/components/AllergyAlertCard';
import AiSummaryCard from './resultContent/components/AiSummaryCard';
import ResultContentFiller from './resultContent/components/ResultContentFiller';
import ResultIngredientsSection from './resultContent/components/ResultIngredientsSection';
import ResultMetaHeader from './resultContent/components/ResultMetaHeader';
import { useResultContentModel } from './resultContent/hooks/useResultContentModel';
import { resultContentStyles as styles } from './resultContent/styles';
import { ResultContentProps } from './resultContent/types';

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
        hasAllergens,
        colorScheme,
        theme,
        locationText,
        formattedTimestamp,
        localizedFoodName,
        localizedIngredients,
    } = useResultContentModel(
        result,
        locationData,
        timestamp,
        t,
        locale
    );

    return (
        <View style={[styles.sheetContainer, { backgroundColor: theme.background }]}> 
            <View style={styles.handleContainer}>
                <View style={[styles.handle, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.contentPadding}>
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

                <AiSummaryCard colorScheme={colorScheme} theme={theme} summary={result.raw_result} t={t} />

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
