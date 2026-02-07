import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
  Modal,
} from 'react-native';
import { X, Target, Activity, Zap, AlertTriangle } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalyzedData } from '../services/ai';
import Svg, { Circle } from 'react-native-svg';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;
const DISMISS_THRESHOLD = 150;

interface BreakdownOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  resultData: AnalyzedData | null;
}

const BreakdownOverlay: React.FC<BreakdownOverlayProps> = ({ isOpen, onClose, resultData }) => {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
          opacity.setValue(1 - gestureState.dy / 500);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD) {
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            onClose();
            translateY.setValue(0);
            opacity.setValue(1);
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          Animated.spring(opacity, {
            toValue: 1,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!isOpen || !resultData) return null;

  const nutrition = resultData.nutrition;
  const hasNutrition = nutrition && nutrition.calories !== null;
  
  // Safely convert to numbers - handle null, undefined, strings, etc.
  const protein = Number(nutrition?.protein) || 0;
  const carbs = Number(nutrition?.carbs) || 0;
  const fat = Number(nutrition?.fat) || 0;
  const calories = Number(nutrition?.calories) || 0;

  const totalMacros = protein + carbs + fat;
  const proteinPercent = totalMacros > 0 ? Math.round((protein / totalMacros) * 100) : 0;
  const carbsPercent = totalMacros > 0 ? Math.round((carbs / totalMacros) * 100) : 0;
  const fatPercent = totalMacros > 0 ? Math.round((fat / totalMacros) * 100) : 0;

  // Ring chart calculations
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - (proteinPercent / 100));

  const hasAllergens = resultData.ingredients.some(i => i.isAllergen);

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        
        <Animated.View 
          style={[
            styles.sheet,
            { 
              transform: [{ translateY }],
              paddingBottom: insets.bottom + 20,
            }
          ]}
        >
          {/* Drag Indicator */}
          <View 
            style={styles.dragIndicatorContainer}
            {...panResponder.panHandlers}
          >
            <View style={styles.dragIndicator} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }} {...panResponder.panHandlers}>
              <Text style={styles.headerTitle}>Molecular Breakdown</Text>
              <Text style={styles.headerSubtitle}>SWIPE DOWN TO CLOSE</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Allergen Warning */}
            {hasAllergens && (
              <View style={styles.allergenBanner}>
                <AlertTriangle size={18} color="#F43F5E" />
                <Text style={styles.allergenText}>Contains Allergens</Text>
              </View>
            )}

            {/* Nutrition Ring Chart */}
            {hasNutrition ? (
              <View style={styles.nutritionCard}>
                <View style={styles.ringContainer}>
                  <Svg width={128} height={128} style={styles.ringSvg}>
                    <Circle
                      cx={64}
                      cy={64}
                      r={radius}
                      fill="transparent"
                      stroke="#E2E8F0"
                      strokeWidth={12}
                    />
                    <Circle
                      cx={64}
                      cy={64}
                      r={radius}
                      fill="transparent"
                      stroke="#3B82F6"
                      strokeWidth={12}
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      rotation={-90}
                      origin="64, 64"
                    />
                  </Svg>
                  <View style={styles.ringCenter}>
                    <Text style={styles.calorieValue}>{Math.round(calories)}</Text>
                    <Text style={styles.calorieLabel}>KCAL</Text>
                  </View>
                </View>

                <View style={styles.macroList}>
                  <View style={styles.macroRow}>
                    <View style={styles.macroLabel}>
                      <View style={[styles.macroDot, { backgroundColor: '#3B82F6' }]} />
                      <Text style={styles.macroName}>PROTEIN</Text>
                    </View>
                    <Text style={styles.macroValue}>{protein.toFixed(1)}g ({proteinPercent}%)</Text>
                  </View>
                  <View style={styles.macroRow}>
                    <View style={styles.macroLabel}>
                      <View style={[styles.macroDot, { backgroundColor: '#F97316' }]} />
                      <Text style={styles.macroName}>CARBS</Text>
                    </View>
                    <Text style={styles.macroValue}>{carbs.toFixed(1)}g ({carbsPercent}%)</Text>
                  </View>
                  <View style={styles.macroRow}>
                    <View style={styles.macroLabel}>
                      <View style={[styles.macroDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.macroName}>FAT</Text>
                    </View>
                    <Text style={styles.macroValue}>{fat.toFixed(1)}g ({fatPercent}%)</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.noNutritionCard}>
                <Text style={styles.noNutritionText}>Nutrition data unavailable</Text>
              </View>
            )}

            {/* Data Source */}
            {hasNutrition && (
              <View style={styles.sourceCard}>
                <Text style={styles.sourceLabel}>Data Source</Text>
                <Text style={styles.sourceValue}>{nutrition.dataSource}</Text>
                <Text style={styles.sourceServing}>per {nutrition.servingSize}</Text>
              </View>
            )}

            {/* Per-Ingredient Nutrition Section */}
            <View style={styles.confidenceSection}>
              <View style={styles.sectionHeader}>
                <Zap size={18} color="#FBBF24" fill="#FBBF24" />
                <Text style={styles.sectionTitle}>Ingredients</Text>
              </View>
              
              {resultData.ingredients.map((item, index) => {
                const ingNutrition = item.nutrition;
                const ingCal = ingNutrition?.calories ?? null;
                
                return (
                  <View key={index} style={styles.ingredientRow}>
                    <View style={styles.ingredientInfo}>
                      <Text style={styles.ingredientName}>{item.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {item.isAllergen && (
                          <View style={styles.allergenTag}>
                            <Text style={styles.allergenTagText}>ALLERGEN</Text>
                          </View>
                        )}
                        {ingCal !== null && (
                          <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                            {Math.round(ingCal)} kcal
                          </Text>
                        )}
                      </View>
                    </View>
                    {ingNutrition && (
                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                        <Text style={{ fontSize: 10, color: '#94A3B8' }}>
                          P: {ingNutrition.protein?.toFixed(1) ?? '-'}g
                        </Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8' }}>
                          C: {ingNutrition.carbs?.toFixed(1) ?? '-'}g
                        </Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8' }}>
                          F: {ingNutrition.fat?.toFixed(1) ?? '-'}g
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: 'white',
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.3,
    shadowRadius: 60,
    elevation: 30,
  },
  dragIndicatorContainer: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
  },
  dragIndicator: {
    width: 48,
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 2,
    marginTop: 4,
    fontStyle: 'italic',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 24,
  },
  allergenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF1F2',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  allergenText: {
    color: '#F43F5E',
    fontWeight: '700',
    fontSize: 13,
  },
  nutritionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    backgroundColor: '#F8FAFC',
    padding: 24,
    borderRadius: 40,
    marginBottom: 16,
  },
  ringContainer: {
    position: 'relative',
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    transform: [{ rotate: '-90deg' }],
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  calorieValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
  },
  calorieLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 2,
  },
  macroList: {
    flex: 1,
    gap: 12,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  macroLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  macroValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  noNutritionCard: {
    backgroundColor: '#F8FAFC',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  noNutritionText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  sourceCard: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 24,
  },
  sourceLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sourceValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
    marginTop: 2,
  },
  sourceServing: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  confidenceSection: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  ingredientRow: {
    marginBottom: 16,
  },
  ingredientInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ingredientName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  allergenTag: {
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  allergenTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F43F5E',
    letterSpacing: 0.5,
  },
  confidenceBar: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 3,
  },
});

export default BreakdownOverlay;
