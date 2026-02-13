import { AnalyzedData } from '@/services/ai';

export type BreakdownOverlayProps = {
    isOpen: boolean;
    onClose: () => void;
    resultData: AnalyzedData | null;
    t: (key: string, fallback?: string) => string;
};

export type MacroRow = {
    name: string;
    color: string;
    value: number;
    percent: number;
};

export type BreakdownViewModel = {
    hasNutrition: boolean;
    hasAllergens: boolean;
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
    proteinPercent: number;
    carbsPercent: number;
    fatPercent: number;
    radius: number;
    circumference: number;
    strokeDashoffset: number;
    macroRows: MacroRow[];
    ingredientMacroLabels: { protein: 'P'; carbs: 'C'; fat: 'F' };
    nutrition: AnalyzedData['nutrition'] | undefined;
};
