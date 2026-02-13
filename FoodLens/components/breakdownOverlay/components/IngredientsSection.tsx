import React from 'react';
import { Text, View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { INGREDIENT_MACRO_KEYS } from '../constants';
import { BreakdownViewModel } from '../types';
import { getBreakdownOverlayStyles } from '../styles';
import { AnalyzedData } from '@/services/ai';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

type IngredientsSectionProps = {
    resultData: AnalyzedData;
    model: BreakdownViewModel;
};

export default function IngredientsSection({ resultData, model }: IngredientsSectionProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const styles = React.useMemo(() => getBreakdownOverlayStyles(theme), [theme]);

    if (!styles) return null;

    return (
        <View style={styles.confidenceSection}>
            <View style={styles.sectionHeader}>
                <Zap size={18} color="#FBBF24" fill="#FBBF24" />
                <Text style={styles.sectionTitle}>Ingredients</Text>
            </View>

            {resultData.ingredients.map((item, index) => {
                const ingNutrition = item.nutrition;
                const ingCal = ingNutrition?.calories ?? null;

                return (
                    <View key={index} style={styles.ingredientRow}>
                        <View style={styles.ingredientInfo}>
                            <Text style={styles.ingredientName}>{item.name}</Text>
                            <View style={styles.ingredientMetaRow}>
                                {item.isAllergen && (
                                    <View style={styles.allergenTag}>
                                        <Text style={styles.allergenTagText}>ALLERGEN</Text>
                                    </View>
                                )}
                                {ingCal !== null && (
                                    <Text style={styles.ingredientCalories}>{Math.round(ingCal)} kcal</Text>
                                )}
                            </View>
                        </View>
                        {ingNutrition && (
                            <View style={styles.ingredientMacroRow}>
                                {INGREDIENT_MACRO_KEYS.map((macroKey) => (
                                    <Text key={macroKey} style={styles.ingredientMacroText}>
                                        {model.ingredientMacroLabels[macroKey]}: {ingNutrition[macroKey]?.toFixed(1) ?? '-'}g
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
