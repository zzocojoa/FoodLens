import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sparkles, Globe } from 'lucide-react-native';
import { useTravelerAllergens } from './travelerAllergyCard/hooks/useTravelerAllergens';
import {
  buildDisplayData,
  buildTravelerMessage,
  isNullAiTranslation,
} from './travelerAllergyCard/utils';

interface TravelerAllergyCardProps {
  countryCode: string | null | undefined;
  aiTranslation: {
      language: string;
      text?: string | null;
      audio_query?: string;
  } | undefined | null;
}

export default function TravelerAllergyCard({ countryCode, aiTranslation }: TravelerAllergyCardProps) {
  const userAllergens = useTravelerAllergens();

  // If not in a foreign country (or country unknown) AND no AI translation, hide.
  // Actually, we want to show it if countryCode is known, even if AI is loading.
  if (!countryCode && !aiTranslation) return null;
  
  const isAiLoaded = aiTranslation !== undefined;
  if (isNullAiTranslation(aiTranslation, isAiLoaded)) return null;

  const displayData = buildDisplayData(countryCode, aiTranslation);
  const finalMessage = buildTravelerMessage(displayData.text, aiTranslation, countryCode, userAllergens);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
          <Globe size={16} color="#3B82F6" />
          <Text style={styles.headerTitle}>TRAVELER ALLERGY CARD • {displayData.language.toUpperCase()}</Text>
          {isAiLoaded && <Sparkles size={14} color="#F59E0B" />}
      </View>
      
      <View style={styles.card}>
          <Text style={styles.mainText}>{finalMessage}</Text>
          <View style={styles.footer}>
            <Text style={styles.subText}>{displayData.sub}</Text>
          </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
        paddingHorizontal: 0, 
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
        paddingHorizontal: 8,
    },
    headerTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 1,
    },
    card: {
        backgroundColor: '#EFF6FF',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: '#BFDBFE',
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    mainText: {
        fontSize: 22,
        fontWeight: '700',
        color: '#1E3A8A',
        marginBottom: 16,
        lineHeight: 34,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    subText: {
        fontSize: 12,
        color: '#60A5FA',
        fontWeight: '600',
        fontStyle: 'italic',
    }
});
