import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { BreakdownViewModel } from '../types';
import { getBreakdownOverlayStyles } from '../styles';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useI18n, formatNumber, formatPercent } from '@/features/i18n';

type NutritionSectionProps = {
    model: BreakdownViewModel;
    t: (key: string, fallback?: string) => string;
};

export default function NutritionSection({ model, t }: NutritionSectionProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { locale } = useI18n();
    const styles = React.useMemo(() => getBreakdownOverlayStyles(theme), [theme]);

    if (!styles || !model.hasNutrition) {
        return (
            <View style={styles.noNutritionCard}>
                <Text style={styles.noNutritionText}>
                    {t('result.breakdown.nutritionUnavailable', 'Nutrition data unavailable')}
                </Text>
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
                        <Text style={styles.calorieValue}>{formatNumber(Math.round(model.calories), locale, { maximumFractionDigits: 0 })}</Text>
                        <Text style={styles.calorieLabel}>{t('result.breakdown.kcal', 'KCAL')}</Text>
                    </View>
                </View>

                <View style={styles.macroList}>
                    {model.macroRows.map((macro) => (
                        <View key={macro.name} style={styles.macroRow}>
                            <View style={styles.macroLabel}>
                                <View style={[styles.macroDot, { backgroundColor: macro.color }]} />
                                <Text style={styles.macroName}>
                                    {macro.name === 'PROTEIN'
                                        ? t('result.breakdown.macro.protein', 'PROTEIN')
                                        : macro.name === 'CARBS'
                                          ? t('result.breakdown.macro.carbs', 'CARBS')
                                          : macro.name === 'FAT'
                                            ? t('result.breakdown.macro.fat', 'FAT')
                                            : macro.name}
                                </Text>
                            </View>
                            <Text style={styles.macroValue}>
                                {t('result.breakdown.macroValueTemplate', '{gram} ({percent})')
                                    .replace('{gram}', `${formatNumber(macro.value, locale)}${t('common.unit.gram', 'g')}`)
                                    .replace('{percent}', formatPercent(macro.percent, locale))}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>

            {model.nutrition && (
                <View style={styles.sourceCard}>
                    <Text style={styles.sourceLabel}>{t('result.breakdown.dataSource', 'Data Source')}</Text>
                    <Text style={styles.sourceValue}>{model.nutrition.dataSource}</Text>
                    <Text style={styles.sourceServing}>
                        {t('result.breakdown.perTemplate', 'per {serving}').replace(
                            '{serving}',
                            String(model.nutrition.servingSize)
                        )}
                    </Text>
                </View>
            )}
        </>
    );
}
