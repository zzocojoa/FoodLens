import React from 'react';
import { Text, View } from 'react-native';
import TravelerAllergyCard from '../TravelerAllergyCard';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import AllergyAlertCard from './resultContent/components/AllergyAlertCard';
import AiSummaryCard from './resultContent/components/AiSummaryCard';
import IngredientsListWithExpand from './resultContent/components/IngredientsListWithExpand';
import ResultMetaHeader from './resultContent/components/ResultMetaHeader';
import { resultContentStyles as styles } from './resultContent/styles';
import { ResultContentProps } from './resultContent/types';
import { formatTimestamp, getLocationText } from './resultContent/utils/resultContentFormatters';

export function ResultContent({ result, locationData, timestamp, onOpenBreakdown, onDatePress }: ResultContentProps) {
    const hasAllergens = result.ingredients.some((i) => i.isAllergen);
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const locationText = getLocationText(locationData);
    const formattedTimestamp = timestamp ? formatTimestamp(timestamp) : null;

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
                            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{result.ingredients.length}개</Text>
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
                    bottom: -2000,
                    left: 0,
                    right: 0,
                    height: 2000,
                    backgroundColor: theme.background,
                }}
            />
        </View>
    );
}
