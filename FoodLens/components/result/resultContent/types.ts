import { ImageSourcePropType } from 'react-native';
import { Colors } from '@/constants/theme';

export type ResultTheme = typeof Colors.light;

export type ResultTranslationCard = {
    language: string;
    text?: string | null;
    audio_query?: string;
};

export type ResultLocationData = {
    formattedAddress?: string | null;
    subregion?: string | null;
    district?: string | null;
    city?: string | null;
    country?: string | null;
    isoCountryCode?: string | null;
} | null;

export type ResultIngredient = {
    name: string;
    name_en?: string;
    name_ko?: string;
    displayName?: string;
    isAllergen: boolean;
};

export type ResultContentData = {
    foodName: string;
    foodName_en?: string;
    foodName_ko?: string;
    confidence?: number;
    ingredients: ResultIngredient[];
    raw_result?: string;
    raw_result_en?: string;
    raw_result_ko?: string;
    translationCard?: ResultTranslationCard | null;
    isBarcode?: boolean;
    imageUri?: string;
};

export type ResultContentProps = {
    result: ResultContentData;
    locationData: ResultLocationData;
    imageSource: ImageSourcePropType | null;
    timestamp?: string | null;
    onOpenBreakdown: () => void;
    onDatePress?: () => void;
    t: (key: string, fallback?: string) => string;
    locale: string;
};
