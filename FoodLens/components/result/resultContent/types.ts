import { ImageSourcePropType } from 'react-native';
import { Colors } from '@/constants/theme';

export type ResultTheme = typeof Colors.light;

export type ResultTranslationCard = {
    language: string;
    text?: string | null;
    audio_query?: string;
};

export type ResultLocationData = {
    formattedAddress?: string;
    city?: string;
    country?: string;
    isoCountryCode?: string;
} | null;

export type ResultIngredient = {
    name: string;
    isAllergen: boolean;
};

export type ResultContentData = {
    foodName: string;
    confidence?: number;
    ingredients: ResultIngredient[];
    raw_result?: string;
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
