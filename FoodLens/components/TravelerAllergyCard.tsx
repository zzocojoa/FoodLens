import React from 'react';
import { View, Text } from 'react-native';
import { Sparkles, Globe } from 'lucide-react-native';
import { useTravelerAllergyCardModel } from './travelerAllergyCard/hooks/useTravelerAllergyCardModel';
import { travelerAllergyCardStyles as styles } from './travelerAllergyCard/styles';
import { TravelerAllergyCardProps } from './travelerAllergyCard/types';

export default function TravelerAllergyCard({ countryCode, aiTranslation }: TravelerAllergyCardProps) {
  const model = useTravelerAllergyCardModel(countryCode, aiTranslation);
  if (!model) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Globe size={16} color="#3B82F6" />
        <Text style={styles.headerTitle}>TRAVELER ALLERGY CARD • {model.displayData.language.toUpperCase()}</Text>
        {model.isAiLoaded && <Sparkles size={14} color="#F59E0B" />}
      </View>

      <View style={styles.card}>
        <Text style={styles.mainText}>{model.finalMessage}</Text>
        <View style={styles.footer}>
          <Text style={styles.subText}>{model.displayData.sub}</Text>
        </View>
      </View>
    </View>
  );
}
