import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { BreakdownViewModel } from '../types';
import { breakdownOverlayStyles as styles } from '../styles';

type NutritionSectionProps = {
    model: BreakdownViewModel;
};

export default function NutritionSection({ model }: NutritionSectionProps) {
    if (!model.hasNutrition) {
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
                        <Circle cx={64} cy={64} r={model.radius} fill="transparent" stroke="#E2E8F0" strokeWidth={12} />
                        <Circle
                            cx={64}
                            cy={64}
                            r={model.radius}
                            fill="transparent"
                            stroke="#3B82F6"
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
