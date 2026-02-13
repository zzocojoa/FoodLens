import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { BreakdownViewModel } from '../types';
import { getBreakdownOverlayStyles } from '../styles';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

type NutritionSectionProps = {
    model: BreakdownViewModel;
};

export default function NutritionSection({ model }: NutritionSectionProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const styles = React.useMemo(() => getBreakdownOverlayStyles(theme), [theme]);

    if (!styles || !model.hasNutrition) {
        return (
            <View style={styles.noNutritionCard}>
                <Text style={styles.noNutritionText}>Nutrition data unavailable</Text>
            </View>
        );
    }

    return (
        <>
            <View style={styles.nutritionCard}>
                <View style={styles.ringContainer}>
                    <Svg width={128} height={128} style={styles.ringSvg}>
                        <Circle cx={64} cy={64} r={model.radius} fill="transparent" stroke={theme.border} strokeWidth={12} />
                        <Circle
                            cx={64}
                            cy={64}
                            r={model.radius}
                            fill="transparent"
                            stroke={theme.primary}
                            strokeWidth={12}
                            strokeDasharray={model.circumference}
                            strokeDashoffset={model.strokeDashoffset}
                            strokeLinecap="round"
                            rotation={-90}
                            origin="64, 64"
                        />
                    </Svg>
                    <View style={styles.ringCenter}>
                        <Text style={styles.calorieValue}>{Math.round(model.calories)}</Text>
                        <Text style={styles.calorieLabel}>KCAL</Text>
                    </View>
                </View>

                <View style={styles.macroList}>
                    {model.macroRows.map((macro) => (
                        <View key={macro.name} style={styles.macroRow}>
                            <View style={styles.macroLabel}>
                                <View style={[styles.macroDot, { backgroundColor: macro.color }]} />
                                <Text style={styles.macroName}>{macro.name}</Text>
                            </View>
                            <Text style={styles.macroValue}>{macro.value}g ({macro.percent}%)</Text>
                        </View>
                    ))}
                </View>
            </View>

            {model.nutrition && (
                <View style={styles.sourceCard}>
                    <Text style={styles.sourceLabel}>Data Source</Text>
                    <Text style={styles.sourceValue}>{model.nutrition.dataSource}</Text>
                    <Text style={styles.sourceServing}>per {model.nutrition.servingSize}</Text>
                </View>
            )}
        </>
    );
}
