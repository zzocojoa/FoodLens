import React, { useEffect, useRef, useState } from 'react';
import BreakdownOverlay from '../components/BreakdownOverlay';
import { View, Text, StyleSheet, Image, Dimensions, TouchableOpacity, ScrollView, Share } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { 
  useSharedValue, 
  useAnimatedScrollHandler, 
  useAnimatedStyle, 
  interpolate, 
  Extrapolation 
} from 'react-native-reanimated';
import { 
  AlertCircle, 
  ShieldCheck, 
  Info,
  ArrowUpCircle,
  Sparkles,
  MapPin,
  Leaf
} from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { dataStore } from '../services/dataStore';
import TravelerAllergyCard from '../components/TravelerAllergyCard';
import { AnalysisService } from '../services/analysisService';

const { width, height } = Dimensions.get('window');
const HEADER_HEIGHT = height * 0.6;

export default function ResultScreen() {
  const { data, location, imageUri, fromStore, isNew } = useLocalSearchParams();
  const router = useRouter();
  
  let result: any = null;
  let locationData: any = null;
  let imageSource: any = null;

  if (fromStore === 'true') {
      const stored = dataStore.getData();
      result = stored.result;
      locationData = stored.location;
      imageSource = stored.imageUri ? { uri: stored.imageUri } : null;
  } else {
      result = typeof data === 'string' ? JSON.parse(data) : null;
      locationData = typeof location === 'string' ? JSON.parse(location) : null;
  }

  const scrollY = useSharedValue(0);
  const containerRef = useRef(null);
  const hasSaved = useRef(false);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [imageSize, setImageSize] = useState<{width: number, height: number} | null>(null);

  const rawImageUri = imageSource?.uri;

  useEffect(() => {
      if (rawImageUri) {
          Image.getSize(rawImageUri, (w, h) => {
              setImageSize({ width: w, height: h });
          }, (err) => {
              console.log("Failed to load image size", err);
          });
      }
  }, [rawImageUri]);
  
  const handleShare = async () => {
    if (!result) return;
    try {
      await Share.share({
        message: `FoodLens Analysis: ${result.foodName} (${result.safetyStatus})`,
      });
    } catch (error) {
      console.warn('Share failed:', error);
    }
  };

  // Auto-save logic
  useEffect(() => {
    const isFromStore = fromStore === 'true';
    const shouldSave = isNew === 'true';
    
    if (result && !hasSaved.current && shouldSave) {
        hasSaved.current = true;
        const TEST_UID = "test-user-v1"; 
        AnalysisService.saveAnalysis(TEST_UID, result, rawImageUri, locationData).catch(err => {
            console.error("[RESULT] Auto-save failed:", err);
        });
    }
  }, [result, locationData, rawImageUri]);

  // Fallback: Generate random coordinates for ingredients if missing (for demo purposes)
  const ingredientsWithCoords = React.useMemo(() => {
      if (!result || !result.ingredients) return [];
      
      // 1. Initial Position Calculation
      let pins = result.ingredients.map((item: any) => {
          let cx, cy;
          
          if (item.box_2d) {
              const [ymin, xmin, ymax, xmax] = item.box_2d;
              cx = ((xmin + xmax) / 2) / 10;
              cy = ((ymin + ymax) / 2) / 10;
          } else {
              // Deterministic random fallback
              const seed = item.name.length;
              cx = (seed * 13) % 80 + 10;
              cy = (seed * 17) % 60 + 20;
          }
          return { ...item, cx, cy, originalCx: cx, originalCy: cy };
      });

      // 2. Collision Resolution (Iterative repulsion)
      const MIN_DIST = 15; // Minimum distance % between pins
      const ITERATIONS = 5;

      for (let iter = 0; iter < ITERATIONS; iter++) {
          for (let i = 0; i < pins.length; i++) {
              for (let j = i + 1; j < pins.length; j++) {
                  const p1 = pins[i];
                  const p2 = pins[j];

                  const dx = p1.cx - p2.cx;
                  const dy = p1.cy - p2.cy;
                  const dist = Math.sqrt(dx * dx + dy * dy);

                  if (dist < MIN_DIST && dist > 0) {
                      // Push apart
                      const overlap = MIN_DIST - dist;
                      const adjustX = (dx / dist) * overlap * 0.5;
                      const adjustY = (dy / dist) * overlap * 0.5;

                      p1.cx += adjustX;
                      p1.cy += adjustY;
                      p2.cx -= adjustX;
                      p2.cy -= adjustY;
                  } else if (dist === 0) {
                      // Exact overlap -> random jitter
                      p1.cx += 1;
                      p1.cy += 1;
                  }
              }
          }
      }

      // 3. Keep within bounds (5% padding)
      pins.forEach((p: any) => {
          p.cx = Math.max(5, Math.min(95, p.cx));
          p.cy = Math.max(5, Math.min(95, p.cy));
      });

      // 4. Convert back to box_2d format for rendering compatibility
      return pins.map((p: any) => ({
          ...p,
          box_2d: [p.cy * 10 - 50, p.cx * 10 - 50, p.cy * 10 + 50, p.cx * 10 + 50]
      }));

  }, [result]);

  // Scroll Handler
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // Animation Styles
  const imageAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, [-100, 0, 100], [1.1, 1, 1.1], Extrapolation.CLAMP);
    const opacity = interpolate(scrollY.value, [0, 300], [1, 0.3], Extrapolation.CLAMP);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const headerOverlayStyle = useAnimatedStyle(() => {
     const opacity = interpolate(scrollY.value, [0, 200], [0, 0.8], Extrapolation.CLAMP);
     return { opacity };
  });

  const pinOpacityStyle = useAnimatedStyle(() => {
      const opacity = interpolate(scrollY.value, [0, 100], [1, 0], Extrapolation.CLAMP);
      return { opacity };
  });

  if (!result) return <View style={styles.loadingContainer}><Text>No Data</Text></View>;

  // Error Handling
  const isError = result.foodName === "Error Analyzing Food" || result.foodName === "Not Food";
  
  if (isError) {
      return (
        <View style={styles.errorContainer}>
            {imageSource && (
                <Image 
                    source={imageSource} 
                    style={styles.errorImage} 
                    resizeMode="cover"
                />
            )}
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            
            <View style={styles.errorContent}>
                <View style={styles.errorIconCircle}>
                    <AlertCircle size={48} color="#EF4444" />
                </View>
                <Text style={styles.errorTitle}>Analysis Failed</Text>
                <Text style={styles.errorDesc}>
                    {result.raw_result || "We couldn't identify this food. Please try again with a clearer photo."}
                </Text>
                
                {/* Fallback Static Card for Safety */}
                {locationData?.isoCountryCode && (
                    <View style={{ width: '100%', marginBottom: 30 }}>
                         <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8, textAlign: 'center' }}>
                             SAFETY CARD (OFFLINE MODE)
                         </Text>
                         <TravelerAllergyCard 
                             countryCode={locationData.isoCountryCode} 
                             aiTranslation={null}
                         />
                    </View>
                )}
                
                <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
                    <Text style={styles.retryText}>Try Again</Text>
                </TouchableOpacity>
            </View>
        </View>
      );
  }

  console.log("Result Ingredients:", JSON.stringify(result.ingredients, null, 2));

  const hasAllergens = result.ingredients.some((i: any) => i.isAllergen);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      {/* --- Sticky Header Image Section --- */}
      <View style={styles.headerContainer}>
        <Animated.View style={[styles.imageWrapper, imageAnimatedStyle]}>
           {imageSource && <Image source={imageSource} style={styles.image} resizeMode="cover" />}
           
           
           {/* Note: BlurView overlay removed - navBar buttons now have white backgrounds for contrast */}

           {/* Spatial Pins */}
             <Animated.View style={[StyleSheet.absoluteFill, pinOpacityStyle]}>
               {ingredientsWithCoords.map((item: any, index: number) => {
                  if (!item.box_2d) return null;
                  // Calculate center from [ymin, xmin, ymax, xmax] (0-1000)
                  const [ymin, xmin, ymax, xmax] = item.box_2d;
                  let centerX = ((xmin + xmax) / 2) / 10; // %
                  let centerY = ((ymin + ymax) / 2) / 10; // %
                  
                  // Aspect Ratio Correction for resizeMode="cover"
                  if (imageSize && imageSize.width > 0 && imageSize.height > 0) {
                      const imageRatio = imageSize.width / imageSize.height;
                      // HEADER_HEIGHT is fixed height, width is screen width
                      const containerRatio = width / HEADER_HEIGHT;
                      
                      if (imageRatio > containerRatio) {
                          // Image is wider: horizontal crop
                          const scale = imageRatio / containerRatio;
                          // Adjust X: expand from center
                          centerX = (centerX - 50) * scale + 50;
                      } else {
                          // Image is taller: vertical crop
                          const scale = containerRatio / imageRatio;
                          // Adjust Y: expand from center
                          centerY = (centerY - 50) * scale + 50;
                      }
                  }
                  
                  return (
                      <View 
                          key={index} 
                          style={{ position: 'absolute', left: `${centerX}%`, top: `${centerY}%` }}
                      >
                        <View style={styles.pinContainer}>
                            {/* Pulse Effect */}
                            <View style={[styles.pinPulse, { backgroundColor: item.isAllergen ? '#F43F5E' : '#3B82F6' }]} />
                            {/* Core Dot */}
                            <View style={[styles.pinDot, { backgroundColor: item.isAllergen ? '#F43F5E' : '#3B82F6' }]} />
                            {/* Label */}
                            <View style={styles.pinLabel}>
                                <BlurView intensity={30} tint="dark" style={styles.pinLabelBlur}>
                                    <Text style={styles.pinLabelText}>{item.name}</Text>
                                </BlurView>
                            </View>
                        </View>
                    </View>
                );
             })}
           </Animated.View>
        </Animated.View>
        
        {/* Blur Overlay on Scroll */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'black' }, headerOverlayStyle]} pointerEvents="none" />
      </View>

      {/* --- Top Navigation Controls (Profile-style flat design) --- */}
      <SafeAreaView style={styles.navSafeArea} edges={['top']}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.navButton}>
              <View pointerEvents="none">
                <Ionicons name="chevron-back" size={28} color="#1C1C1E" />
              </View>
          </TouchableOpacity>
          <View style={{flex: 1}} />
          <TouchableOpacity onPress={handleShare} style={styles.navButton}>
              <View pointerEvents="none">
                <Ionicons name="share-outline" size={22} color="#1C1C1E" />
              </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* --- Scrollable Content --- */}
      <Animated.ScrollView 
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: HEADER_HEIGHT - 40, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
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
                    
                    <View style={styles.statsRow}>
                        <View style={[styles.statBadge, { backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' }]}>
                            <ShieldCheck size={14} color="#059669" />
                            <Text style={[styles.statText, { color: '#047857' }]}>
                              {typeof result.confidence === 'number' ? `${result.confidence}% MATCH` : 'N/A'}
                            </Text>
                        </View>
                        <TouchableOpacity 
                          onPress={() => setIsBreakdownOpen(true)}
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
                            <View key={index} style={[styles.ingredientItem, item.isAllergen && styles.ingredientItemDanger]}>
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
      </Animated.ScrollView>

      {/* Floating Bottom Action */}
      <View style={styles.bottomFloat}>
          <TouchableOpacity style={styles.saveButton} onPress={() => router.replace('/')}>
              <ArrowUpCircle size={22} color="white" />
              <Text style={styles.saveButtonText}>Save to Journal</Text>
          </TouchableOpacity>
      </View>

      {/* Breakdown Overlay */}
      <BreakdownOverlay 
        isOpen={isBreakdownOpen}
        onClose={() => setIsBreakdownOpen(false)}
        resultData={result}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // slate-50
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
    zIndex: 0,
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    overflow: 'hidden', // Required for BlurView
  },
  
  // Pins
  pinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100, // area for triggering?
    height: 100,
    transform: [{ translateX: -50 }, { translateY: -50 }], // Center on coordinate
  },
  pinPulse: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    opacity: 0.3,
  },
  pinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: 'black',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  pinLabel: {
    position: 'absolute',
    top: 60, // below dot
  },
  pinLabelBlur: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pinLabelText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Navigation Bar (Profile-style flat design)
  navSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'transparent',
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },

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
    marginBottom: 20,
    lineHeight: 38,
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
  actionLink: {
    fontSize: 11,
    fontWeight: '900',
    color: '#2563EB',
    letterSpacing: 1.5,
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
    backgroundColor: '#F43F5E',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F43F5E',
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  // AI Summary
  aiSummaryCard: {
    marginTop: 20,
    padding: 32,
    backgroundColor: '#0F172A',
    borderRadius: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 10,
  },
  aiGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(59,130,246,0.15)',
    transform: [{ scale: 1.5 }],
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
  },
  aiText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 24,
  },

  // Floating Bottom
  bottomFloat: {
    position: 'absolute',
    bottom: 40,
    left: 32,
    right: 32,
  },
  saveButton: {
    backgroundColor: '#2563EB',
    height: 72,
    borderRadius: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
  },
  
  // Error State
  errorContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    opacity: 0.5,
  },
  errorContent: {
    padding: 32,
    alignItems: 'center',
    width: '100%',
  },
  errorIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#FEF2F2',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      shadowColor: '#EF4444',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
  },
  errorTitle: {
      fontSize: 24,
      fontWeight: '900',
      color: 'white',
      marginBottom: 12,
      textAlign: 'center',
  },
  errorDesc: {
      fontSize: 16,
      color: '#94A3B8',
      textAlign: 'center',
      marginBottom: 40,
      lineHeight: 24,
  },
  retryButton: {
      backgroundColor: '#EF4444',
      paddingHorizontal: 32,
      paddingVertical: 16,
      borderRadius: 100,
      shadowColor: '#EF4444',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
  },
  retryText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '800',
  },
});
