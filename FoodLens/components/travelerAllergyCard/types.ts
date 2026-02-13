export type AiTranslation = {
  language: string;
  text?: string | null;
  audio_query?: string;
} | null | undefined;

export interface TravelerAllergyCardProps {
  countryCode: string | null | undefined;
  aiTranslation: AiTranslation;
}
