import React from 'react';
import { View, Text } from 'react-native';
import { Globe } from 'lucide-react-native';
import { useTravelerAllergyCardModel } from './travelerAllergyCard/hooks/useTravelerAllergyCardModel';
import { travelerAllergyCardStyles as styles } from './travelerAllergyCard/styles';
import { TravelerAllergyCardProps } from './travelerAllergyCard/types';
import { useI18n } from '@/features/i18n';

const resolveTravelerLanguageLabel = (
  language: string,
  t: (key: string, fallback?: string) => string
): string => {
  const normalized = language.trim().toLowerCase();

  if (normalized === 'korean' || normalized === 'kr' || normalized === 'ko' || normalized === 'ko-kr') {
    return t('travelerCard.language.korean', '한국어');
  }

  if (normalized === 'english' || normalized === 'us' || normalized === 'en' || normalized === 'en-us') {
    return t('travelerCard.language.english', '영어');
  }

  if (normalized === 'japanese' || normalized === 'jp' || normalized === 'ja' || normalized === 'ja-jp') {
    return t('travelerCard.language.japanese', '일본어');
  }

  if (normalized === 'chinese' || normalized === 'cn' || normalized === 'zh' || normalized === 'zh-hans') {
    return t('travelerCard.language.chineseSimplified', '중국어 간체');
  }

  if (
    normalized === 'traditional chinese' ||
    normalized === 'zh-hant' ||
    normalized === 'zh-tw' ||
    normalized === 'tw'
  ) {
    return t('travelerCard.language.chineseTraditional', '중국어 번체');
  }

  if (normalized === 'thai' || normalized === 'th' || normalized === 'th-th') {
    return t('travelerCard.language.thai', '태국어');
  }

  if (normalized === 'vietnamese' || normalized === 'vn' || normalized === 'vi' || normalized === 'vi-vn') {
    return t('travelerCard.language.vietnamese', '베트남어');
  }

  if (normalized === 'indonesian' || normalized === 'id' || normalized === 'id-id') {
    return t('travelerCard.language.indonesian', '인도네시아어');
  }

  if (normalized === 'french' || normalized === 'fr' || normalized === 'fr-fr') {
    return t('travelerCard.language.french', '프랑스어');
  }

  if (normalized === 'italian' || normalized === 'it' || normalized === 'it-it') {
    return t('travelerCard.language.italian', '이탈리아어');
  }

  if (normalized === 'spanish' || normalized === 'es' || normalized === 'es-es') {
    return t('travelerCard.language.spanish', '스페인어');
  }

  if (normalized === 'german' || normalized === 'de' || normalized === 'de-de') {
    return t('travelerCard.language.german', '독일어');
  }

  return language;
};

const resolveTravelerFinalMessage = (
  message: string,
  t: (key: string, fallback?: string) => string
): string => {
  const englishAllergiesPrefix = '⚠️ My Allergies:';
  const localizedAllergiesPrefix = t('travelerCard.allergiesLabel', '⚠️ My allergies:');

  return message.replace(englishAllergiesPrefix, localizedAllergiesPrefix);
};

export default function TravelerAllergyCard({ countryCode, aiTranslation }: TravelerAllergyCardProps) {
  const { t } = useI18n();
  const model = useTravelerAllergyCardModel(countryCode, aiTranslation);
  if (!model) return null;

  const travelerLanguageLabel = resolveTravelerLanguageLabel(model.displayData.language, t);
  const travelerFinalMessage = resolveTravelerFinalMessage(model.finalMessage, t);

  return (
    <View style={styles.container}>
      <View style={styles.cardShell}>
        <View style={styles.header}>
          <Globe size={16} color="#4C6EA8" />
          <Text style={styles.headerTitle}>
            {t('travelerCard.title', 'Traveler allergy card')} • {travelerLanguageLabel}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.mainText}>{travelerFinalMessage}</Text>
        </View>
      </View>
    </View>
  );
}
