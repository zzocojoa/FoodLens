import { Colors } from '@/constants/theme';

export type ResultTheme = typeof Colors.light;

export type ResultIngredient = {
    name: string;
    isAllergen: boolean;
};

export type ResultContentProps = {
    result: {
        foodName: string;
        confidence?: number;
        ingredients: ResultIngredient[];
        raw_result?: string;
        translationCard?: any;
    };
    locationData: any;
    timestamp?: string | null;
    onOpenBreakdown: () => void;
    onDatePress?: () => void;
};
