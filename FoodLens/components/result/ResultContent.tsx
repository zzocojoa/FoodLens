import React from 'react';
import { Text, View } from 'react-native';
import TravelerAllergyCard from '../TravelerAllergyCard';
import AllergyAlertCard from './resultContent/components/AllergyAlertCard';
import AiSummaryCard from './resultContent/components/AiSummaryCard';
import IngredientsListWithExpand from './resultContent/components/IngredientsListWithExpand';
import ResultMetaHeader from './resultContent/components/ResultMetaHeader';
import { RESULT_CONTENT_FILLER_HEIGHT } from './resultContent/constants';
import { useResultContentModel } from './resultContent/hooks/useResultContentModel';
import { resultContentStyles as styles } from './resultContent/styles';
import { ResultContentProps } from './resultContent/types';
import { getIngredientCountLabel } from './resultContent/utils/contentMeta';

export function ResultContent({ result, locationData, timestamp, onOpenBreakdown, onDatePress }: ResultContentProps) {
    const { hasAllergens, colorScheme, theme, locationText, formattedTimestamp } = useResultContentModel(
        result,
        locationData,
        timestamp
    );

    return (
        <View style={[styles.sheetContainer, { backgroundColor: theme.background }]}> 
            <View style={styles.handleContainer}>
                <View style={[styles.handle, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.contentPadding}>
                <ResultMetaHeader
                    foodName={result.foodName}
                    confidence={result.confidence}
                    locationText={locationText}
                    formattedTimestamp={formattedTimestamp}
                    theme={theme}
                    onOpenBreakdown={onOpenBreakdown}
                    onDatePress={onDatePress}
                />

                {hasAllergens && <AllergyAlertCard colorScheme={colorScheme} />}

                <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Ingredients</Text>
                        {result.ingredients.length > 0 && (
                            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                {getIngredientCountLabel(result.ingredients)}
                            </Text>
                        )}
                    </View>

                    <IngredientsListWithExpand ingredients={result.ingredients} theme={theme} />
                </View>

                <AiSummaryCard colorScheme={colorScheme} theme={theme} summary={result.raw_result} />

                <View style={{ marginTop: 24 }}>
                    <TravelerAllergyCard
                        countryCode={locationData?.isoCountryCode}
                        aiTranslation={result.translationCard}
                    />
                </View>
            </View>

            <View
                style={{
                    position: 'absolute',
                    bottom: -RESULT_CONTENT_FILLER_HEIGHT,
                    left: 0,
                    right: 0,
                    height: RESULT_CONTENT_FILLER_HEIGHT,
                    backgroundColor: theme.background,
                }}
            />
        </View>
    );
}
