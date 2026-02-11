import { AnalyzedData } from '@/services/ai';
import { BreakdownViewModel } from '../types';

export const buildBreakdownViewModel = (resultData: AnalyzedData): BreakdownViewModel => {
    const nutrition = resultData.nutrition;
    const hasNutrition = Boolean(nutrition && nutrition.calories !== null);

    const protein = Number(nutrition?.protein) || 0;
    const carbs = Number(nutrition?.carbs) || 0;
    const fat = Number(nutrition?.fat) || 0;
    const calories = Number(nutrition?.calories) || 0;

    const totalMacros = protein + carbs + fat;
    const proteinPercent = totalMacros > 0 ? Math.round((protein / totalMacros) * 100) : 0;
    const carbsPercent = totalMacros > 0 ? Math.round((carbs / totalMacros) * 100) : 0;
    const fatPercent = totalMacros > 0 ? Math.round((fat / totalMacros) * 100) : 0;

    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - proteinPercent / 100);

    const hasAllergens = resultData.ingredients.some((item) => item.isAllergen);

    const macroRows = [
        { name: 'PROTEIN', color: '#3B82F6', value: protein.toFixed(1), percent: proteinPercent },
        { name: 'CARBS', color: '#F97316', value: carbs.toFixed(1), percent: carbsPercent },
        { name: 'FAT', color: '#10B981', value: fat.toFixed(1), percent: fatPercent },
    ];

    const ingredientMacroLabels = { protein: 'P', carbs: 'C', fat: 'F' } as const;

    return {
        hasNutrition,
        hasAllergens,
        protein,
        carbs,
        fat,
        calories,
        proteinPercent,
        carbsPercent,
        fatPercent,
        radius,
        circumference,
        strokeDashoffset,
        macroRows,
        ingredientMacroLabels,
        nutrition,
    };
};
