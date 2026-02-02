import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { 
  AlertCircle, 
  ShieldCheck, 
  Sparkles,
  MapPin,
  Leaf
} from 'lucide-react-native';
import TravelerAllergyCard from '../TravelerAllergyCard';
import { getEmoji } from '../../services/utils';

// Helper for pure rendering of ingredients to avoid clutter
const IngredientItem = ({ item }: { item: any }) => (
    <View style={[styles.ingredientItem, item.isAllergen && styles.ingredientItemDanger]}>
        <View style={styles.ingredientLeft}>
            <View style={[styles.ingredientIcon, item.isAllergen ? styles.iconBgDanger : styles.iconBgSafe]}>
                <Leaf size={20} color={item.isAllergen ? '#E11D48' : '#64748B'} />
            </View>
            <View>
                <Text style={[styles.ingredientName, item.isAllergen && { color: '#881337' }]}>
                    {item.name}
                </Text>
                <Text style={styles.ingredientMeta}>
                    {item.isAllergen ? 'Allergen detected' : 'Healthy component'}
                </Text>
            </View>
        </View>
        
        {item.isAllergen ? (
            <View style={styles.statusIconDanger}>
                <AlertCircle size={14} color="white" />
            </View>
        ) : (
            <View style={styles.statusIconSafe}>
                <ShieldCheck size={14} color="#10B981" />
            </View>
        )}
    </View>
);

interface ResultContentProps {
  result: any;
  locationData: any;
  onOpenBreakdown: () => void;
}

export function ResultContent({ result, locationData, onOpenBreakdown }: ResultContentProps) {
  const hasAllergens = result.ingredients.some((i: any) => i.isAllergen);

  return (
    <View style={styles.sheetContainer}>
        {/* Handle */}
        <View style={styles.handleContainer}>
            <View style={styles.handle} />
        </View>

        <View style={styles.contentPadding}>
            {/* Title & Stats */}
            <View style={styles.headerSection}>
                <View style={styles.subHeaderRow}>
                    <MapPin size={12} color="#60A5FA" />
                    <Text style={styles.subHeaderText}>VISUAL RECOGNITION</Text>
                </View>
                <Text style={styles.titleText}>{result.foodName}</Text>
                
                {/* Location Info */}
                <View style={styles.locationRow}>
                    <MapPin size={12} color="#94A3B8" />
                    <Text style={styles.locationText}>
                        {locationData && (locationData.formattedAddress || [locationData.city, locationData.country].filter(Boolean).join(', ')) 
                            ? (locationData.formattedAddress || [locationData.city, locationData.country].filter(Boolean).join(', '))
                            : "No Location Info"}
                    </Text>
                </View>
                
                <View style={styles.statsRow}>
                    <View style={[styles.statBadge, { backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' }]}>
                        <ShieldCheck size={14} color="#059669" />
                        <Text style={[styles.statText, { color: '#047857' }]}>
                          {typeof result.confidence === 'number' ? `${result.confidence}% MATCH` : 'N/A'}
                        </Text>
                    </View>
                    <TouchableOpacity 
                      onPress={onOpenBreakdown}
                      style={[styles.statBadge, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}
                    >
                        <Sparkles size={14} color="#4F46E5" />
                        <Text style={[styles.statText, { color: '#4F46E5' }]}>BREAKDOWN</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Allergy Warning Card */}
            {hasAllergens && (
                <View style={styles.allergyCard}>
                     <View style={styles.allergyIconBox}>
                         <AlertCircle size={28} color="white" />
                     </View>
                     <View style={{ flex: 1 }}>
                         <Text style={styles.allergyTitle}>Allergy Alert</Text>
                         <Text style={styles.allergyDesc}>
                            Contains ingredients that match your allergy profile. Please exercise caution.
                         </Text>
                     </View>
                </View>
            )}

            {/* Ingredients List */}
            <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Ingredients</Text>
                </View>

                <View style={styles.ingredientsList}>
                    {result.ingredients.map((item: any, index: number) => (
                        <IngredientItem key={index} item={item} />
                    ))}
                </View>
            </View>

            {/* AI Summary */}
            <View style={styles.aiSummaryCard}>
                <View style={styles.aiGlow} />
                <View style={styles.aiHeader}>
                    <Sparkles size={18} color="#60A5FA" fill="#60A5FA" />
                    <Text style={styles.aiTitle}>AI Health Coach</Text>
                </View>
                <Text style={styles.aiText}>
                    {result.raw_result || "This food appears balanced. Assuming no hidden allergens, it fits well within a moderate diet."}
                </Text>
            </View>
            
            <View style={{ marginTop: 24 }}>
                <TravelerAllergyCard 
                    countryCode={locationData?.isoCountryCode} 
                    aiTranslation={result.translationCard}
                />
            </View>

        </View>
    </View>
  );
}

const { height } = Dimensions.get('window');

const styles = StyleSheet.create({
  // Sheet
  sheetContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
    minHeight: height, // allow scrolling
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 10,
  },
  handle: {
    width: 56,
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
  },
  contentPadding: {
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 150,
  },
  
  // Header Section
  headerSection: {
    marginBottom: 40,
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  subHeaderText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 2,
  },
  titleText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 12,
    lineHeight: 38,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
  },
  locationText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  statText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Allergy Card
  allergyCard: {
    backgroundColor: '#FFF1F2', // rose-50
    borderWidth: 1,
    borderColor: '#FFE4E6',
    borderRadius: 36,
    padding: 24,
    marginBottom: 40,
    flexDirection: 'row',
    gap: 16,
  },
  allergyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F43F5E',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F43F5E',
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  allergyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#881337',
    marginBottom: 4,
  },
  allergyDesc: {
    fontSize: 13,
    color: '#BE123C',
    fontWeight: '500',
    lineHeight: 20,
  },

  // Section
  section: {
    marginBottom: 30,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  ingredientsList: {
    gap: 16,
  },
  ingredientItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  ingredientItemDanger: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FFE4E6',
  },
  ingredientLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  ingredientIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  iconBgSafe: {
    backgroundColor: '#F8FAFC',
  },
  iconBgDanger: {
    backgroundColor: '#FFE4E6',
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1E293B',
    marginBottom: 2,
  },
  ingredientMeta: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusIconSafe: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  statusIconDanger: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFE4E6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDA4AF',
  },

  // AI Summary
  aiSummaryCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E0F2FE',
    overflow: 'hidden',
  },
  aiGlow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0284C7',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  aiText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 24,
    fontWeight: '500',
  },
});
