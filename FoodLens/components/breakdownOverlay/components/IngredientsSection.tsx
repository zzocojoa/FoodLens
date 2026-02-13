import React from 'react';
import { Text, View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { INGREDIENT_MACRO_KEYS } from '../constants';
import { BreakdownViewModel } from '../types';
import { getBreakdownOverlayStyles } from '../styles';
import { AnalyzedData } from '@/services/ai';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useI18n, formatNumber } from '@/features/i18n';

type IngredientsSectionProps = {
    resultData: AnalyzedData;
    model: BreakdownViewModel;
    t: (key: string, fallback?: string) => string;
};

export default function IngredientsSection({ resultData, model, t }: IngredientsSectionProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { locale } = useI18n();
    const styles = React.useMemo(() => getBreakdownOverlayStyles(theme), [theme]);
    const isKoreanLocale = locale.toLowerCase().startsWith('ko');

    if (!styles) return null;

    return (
        <View style={styles.confidenceSection}>
            <View style={styles.sectionHeader}>
                <Zap size={18} color="#FBBF24" fill="#FBBF24" />
                <Text style={styles.sectionTitle}>{t('result.ingredients.title', 'Ingredients')}</Text>
            </View>

            {resultData.ingredients.map((item, index) => {
                const ingNutrition = item.nutrition;
                const ingCal = ingNutrition?.calories ?? null;
                const ingredientName = isKoreanLocale
                    ? item.name_ko || item.name_en || item.name
                    : item.name_en || item.name || item.name_ko || 'Unknown';

                return (
                    <View key={index} style={styles.ingredientRow}>
                        <View style={styles.ingredientInfo}>
                            <Text style={styles.ingredientName}>{ingredientName}</Text>
                            <View style={styles.ingredientMetaRow}>
                                {item.isAllergen && (
                                    <View style={styles.allergenTag}>
                                        <Text style={styles.allergenTagText}>
                                            {t('result.breakdown.allergenTag', 'ALLERGEN')}
                                        </Text>
                                    </View>
                                )}
                                {ingCal !== null && (
                                    <Text style={styles.ingredientCalories}>
                                        {t('result.breakdown.calorieValueTemplate', '{value} {unit}')
                                            .replace('{value}', formatNumber(Math.round(ingCal), locale, { maximumFractionDigits: 0 }))
                                            .replace('{unit}', t('common.unit.kcal', 'kcal'))}
                                    </Text>
                                )}
                            </View>
                        </View>
                        {ingNutrition && (
                            <View style={styles.ingredientMacroRow}>
                                {INGREDIENT_MACRO_KEYS.map((macroKey) => (
                                    <Text key={macroKey} style={styles.ingredientMacroText}>
                                        {(() => {
                                            const rawValue = ingNutrition[macroKey];
                                            const gramValue =
                                                typeof rawValue === 'number'
                                                    ? `${formatNumber(rawValue, locale)}${t('common.unit.gram', 'g')}`
                                                    : '-';
                                            return t('result.breakdown.ingredientMacroTemplate', '{label}: {gram}')
                                                .replace('{label}', model.ingredientMacroLabels[macroKey])
                                                .replace('{gram}', gramValue);
                                        })()}
                                    </Text>
                                ))}
                            </View>
                        )}
                    </View>
                );
            })}
        </View>
    );
}
