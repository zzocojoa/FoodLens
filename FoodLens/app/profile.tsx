import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserService } from '../services/userService';
import { SEARCHABLE_INGREDIENTS } from '../data/ingredients';

// Modern Color Palette (2026 Trend: Soft Pastels + Deep Accents)
import { Colors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { HapticTouchableOpacity } from '../components/HapticFeedback'; // Assuming this exists, based on context

// ... existing emoji assets ...
const ALLERGEN_IMAGES = {
  egg: require('../assets/images/allergens/egg.png'),
  milk: require('../assets/images/allergens/milk.png'),
  peanut: require('../assets/images/allergens/peanut.png'),
  shellfish: require('../assets/images/allergens/shellfish.png'),
  wheat: require('../assets/images/allergens/wheat.png'),
  soy: require('../assets/images/allergens/soy.png'),
  treenut: require('../assets/images/allergens/treenut.png'),
  fish: require('../assets/images/allergens/fish.png'),
};

const COMMON_ALLERGENS = [
  { id: 'egg', label: 'Eggs', image: ALLERGEN_IMAGES.egg },
  { id: 'milk', label: 'Milk', image: ALLERGEN_IMAGES.milk },
  { id: 'peanut', label: 'Peanuts', image: ALLERGEN_IMAGES.peanut },
  { id: 'shellfish', label: 'Shellfish', image: ALLERGEN_IMAGES.shellfish },
  { id: 'wheat', label: 'Wheat', image: ALLERGEN_IMAGES.wheat },
  { id: 'soy', label: 'Soy', image: ALLERGEN_IMAGES.soy },
  { id: 'treenut', label: 'Tree Nuts', image: ALLERGEN_IMAGES.treenut },
  { id: 'fish', label: 'Fish', image: ALLERGEN_IMAGES.fish },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { theme: currentTheme, setTheme, colorScheme } = useTheme();
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  
  const [allergies, setAllergies] = useState<string[]>([]);
  const [otherRestrictions, setOtherRestrictions] = useState<string[]>([]);
  // suggestions logic
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Mock UID
  const TEST_UID = "test-user-v1";

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
       const user = await UserService.getUserProfile(TEST_UID);
       if (user) {
         setAllergies(user.safetyProfile.allergies);
         setOtherRestrictions(user.safetyProfile.dietaryRestrictions);
       }
    } catch (e) {
       // ignore
    } finally {
      setLoading(false);
    }
  };

  const toggleAllergen = (id: string) => {
    if (allergies.includes(id)) {
      setAllergies(allergies.filter(a => a !== id));
    } else {
      setAllergies([...allergies, id]);
    }
  };

  const scrollViewRef = React.useRef<ScrollView>(null);
  const shouldScroll = React.useRef(false);

  /* Common helper to add item if not exists */
  const addItemToRestrictions = (text: string) => {
    const item = text.trim();
    if (item.length > 0) {
      if (!otherRestrictions.includes(item)) {
         shouldScroll.current = true;
         setOtherRestrictions([...otherRestrictions, item]);
      }
      // Reset input state
      setInputValue('');
      setSuggestions([]);
    }
  };

  const addOtherRestriction = () => {
    addItemToRestrictions(inputValue);
  };

  const removeRestriction = (item: string) => {
    setOtherRestrictions(otherRestrictions.filter(r => r !== item));
  };

  const handleInputChange = (text: string) => {
    setInputValue(text);
    if (text.length > 0) {
        const filtered = SEARCHABLE_INGREDIENTS.filter(item => 
            item.toLowerCase().includes(text.toLowerCase()) && 
            !otherRestrictions.includes(item)
        ).slice(0, 5); // Limit to top 5
        setSuggestions(filtered);
    } else {
        setSuggestions([]);
    }
  };

  const selectSuggestion = (item: string) => {
    addItemToRestrictions(item);
  };

  const saveProfile = async () => {
    setLoading(true);
    try {
      await UserService.CreateOrUpdateProfile(TEST_UID, "test@example.com", {
        safetyProfile: {
          allergies: allergies,
          dietaryRestrictions: otherRestrictions
        },
        settings: {
            language: 'en', // UI language (default en)
            autoPlayAudio: false
        }
      });
      Alert.alert("Updated", "Your profile and preferences have been saved.");
    } catch (error) {
      Alert.alert("Error", "Failed to save.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, {backgroundColor: theme.background}]}>
        {/* ... Navbar ... */}
        <View style={styles.navBar}>
            <TouchableOpacity 
                onPress={() => router.back()} 
                style={styles.navButton}
            >
                <Ionicons name="chevron-back" size={28} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.navTitle, {color: theme.textPrimary}]}>Health Profile</Text>
            <View style={{width: 28}} /> 
        </View>

        <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{flex: 1}}
        >
        <ScrollView 
            ref={scrollViewRef}
            style={styles.container} 
            contentContainerStyle={{
                paddingBottom: otherRestrictions.length === 0 ? insets.bottom + 40 : insets.bottom + 150
            }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
                if (shouldScroll.current) {
                    scrollViewRef.current?.scrollToEnd({ animated: true });
                    shouldScroll.current = false;
                }
            }}
        >


            <View style={styles.heroSection}>
                <Text style={[styles.heroTitle, {color: theme.textPrimary}]}>What should we avoid?</Text>
                <Text style={[styles.heroSubtitle, {color: theme.textSecondary}]}>Select ingredients you are allergic to or cannot eat.</Text>
            </View>

            {/* Quick Select Grid */}
            <Text style={[styles.sectionHeader, {color: theme.textPrimary}]}>Common Allergens</Text>
            <View style={styles.grid}>
                {COMMON_ALLERGENS.map((item) => {
                    const isSelected = allergies.includes(item.id);
                    return (
                        <TouchableOpacity 
                            key={item.id} 
                            style={[
                                styles.card, 
                                { backgroundColor: theme.surface }, // Default bg
                                isSelected && { backgroundColor: theme.primary, borderColor: theme.primary }
                            ]}
                            activeOpacity={0.7}
                            onPress={() => toggleAllergen(item.id)}
                        >
                            <View style={[styles.iconCircle, isSelected && {backgroundColor: 'rgba(255,255,255,0.2)'}]}>
                                <Image source={item.image} style={{width: 40, height: 40}} resizeMode="contain" />
                            </View>
                            <Text style={[styles.cardLabel, {color: theme.textPrimary}, isSelected && {color: 'white'}]}>{item.label}</Text>
                            {isSelected && (
                                <View style={styles.checkBadge}>
                                    <Ionicons name="checkmark" size={12} color={theme.primary} />
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Custom Input with Autocomplete */}
            <Text style={[styles.sectionHeader, {color: theme.textPrimary}]}>Other Restrictions</Text>
            <View style={{zIndex: 10}}>
                <View style={[styles.inputWrapper, {backgroundColor: theme.surface, shadowColor: theme.shadow}]}>
                    <Ionicons name="search" size={20} color={theme.textSecondary} style={{marginRight: 10}} />
                    <TextInput 
                        style={[styles.input, {color: theme.textPrimary}]}
                        placeholder="Type (e.g. Peach, Vegan)..."
                        placeholderTextColor={theme.textSecondary}
                        value={inputValue}
                        onChangeText={handleInputChange}
                        onSubmitEditing={addOtherRestriction}
                        returnKeyType="done"
                    />
                    {inputValue.length > 0 && (
                        <TouchableOpacity onPress={addOtherRestriction}>
                            <Ionicons name="add-circle" size={28} color={theme.primary} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Autocomplete Suggestions */}
                {suggestions.length > 0 && (
                    <View style={styles.suggestionsDropdown}>
                        {suggestions.map((item, index) => (
                            <TouchableOpacity 
                                key={index} 
                                style={[styles.suggestionItem, { borderBottomColor: theme.border }]}
                                onPress={() => selectSuggestion(item)}
                            >
                                <Ionicons name="add" size={16} color={theme.primary} style={{marginRight: 8}} />
                                <Text style={[styles.suggestionText, {color: theme.textPrimary}]}>{item}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>

            {/* Tags Cloud */}
            <View style={styles.tagContainer}>
                {otherRestrictions.map((item, index) => (
                    <View key={index} style={[styles.tag, {backgroundColor: theme.surface, borderColor: theme.border }]}>
                         <Text style={[styles.tagText, {color: theme.primary}]}>{item}</Text>
                         <TouchableOpacity onPress={() => removeRestriction(item)} hitSlop={{top:10, bottom:10, left:10, right:10}}>
                             <Ionicons name="close" size={16} color={theme.primary} style={{marginLeft: 6}} />
                         </TouchableOpacity>
                    </View>
                ))}
            </View>

        </ScrollView>
        </KeyboardAvoidingView>

        {/* Floating Save Button */}
        <View style={[styles.footer, {backgroundColor: theme.background, borderTopColor: theme.border}]}>
            <TouchableOpacity 
                style={[styles.saveButton, {backgroundColor: theme.textPrimary, shadowColor: theme.shadow}]} 
                onPress={saveProfile}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color={theme.background} /> 
                ) : (
                    <Text style={[styles.saveButtonText, {color: theme.background}]}>Save Changes</Text>
                )}
            </TouchableOpacity>
        </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
      flex: 1,
      // backgroundColor: COLORS.background, // Handled inline
  },
  navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 15,
  },
  navButton: {
      padding: 5,
  },
  navTitle: {
      fontSize: 17,
      fontWeight: '600',
      // color: COLORS.text, // Handled inline
  },
  container: {
      flex: 1,
      paddingHorizontal: 20,
  },
  heroSection: {
      marginTop: 20,
      marginBottom: 30,
  },
  heroTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      // color: COLORS.text, // Handled inline
      marginBottom: 8,
  },
  heroSubtitle: {
      fontSize: 16,
      // color: COLORS.subtext, // Handled inline
      lineHeight: 22,
  },
  sectionHeader: {
      fontSize: 18,
      fontWeight: '700',
      // color: COLORS.text, // Handled inline
      marginBottom: 15,
      marginTop: 10,
  },
  grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 12,
  },
  card: {
      width: '48%', // 2 columns
      // backgroundColor: COLORS.card, // Handled inline
      borderRadius: 20,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      // Modern Shadow
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
      borderWidth: 1,
      borderColor: 'transparent',
  },
  cardSelected: {
      // backgroundColor: COLORS.primary, // Handled inline
      // borderColor: COLORS.primary, // Handled inline
  },
  iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
  },
  cardLabel: {
      fontSize: 16,
      fontWeight: '600',
      // color: COLORS.text, // Handled inline
  },
  checkBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      backgroundColor: 'white',
      borderRadius: 10,
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
  },
  inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      // backgroundColor: COLORS.card, // Handled inline
      borderRadius: 16,
      paddingHorizontal: 15,
      paddingVertical: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 1,
      marginBottom: 20,
  },
  input: {
      flex: 1,
      fontSize: 16,
      // color: COLORS.text, // Handled inline
  },
  tagContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
  },
  tag: {
      backgroundColor: '#E6F0FF',
      borderRadius: 100,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      // borderColor: '#B3D7FF', // Handled inline
  },
  tagText: {
      // color: COLORS.primary, // Handled inline
      fontWeight: '600',
      fontSize: 14,
  },
  emptyState: {
      // color: COLORS.subtext, // Handled inline
      fontStyle: 'italic',
  },
  footer: {
      // backgroundColor: COLORS.background, // Handled inline
      padding: 20,
      paddingBottom: Platform.OS === 'ios' ? 30 : 20,
      borderTopWidth: 1,
      // borderTopColor: COLORS.border, // Handled inline
  },
  saveButton: {
      // backgroundColor: COLORS.text, // Handled inline
      borderRadius: 24,
      paddingVertical: 18,
      alignItems: 'center',
      // shadowColor: COLORS.primary, // Handled inline
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 5,
  },
  saveButtonText: {
      color: 'white',
      fontSize: 18,
      fontWeight: 'bold',
  },
  suggestionsDropdown: {
      marginTop: 8, // Push down slightly
      backgroundColor: 'white',
      borderRadius: 16,
      paddingVertical: 8,
      // Keep shadows for card effect
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 5,
      borderWidth: 1,
      // borderColor: COLORS.border, // Handled inline
      marginBottom: 20, // Space before tags
  },
  suggestionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 0.5,
      // borderBottomColor: COLORS.inputBg, // Handled inline
  },
  suggestionText: {
      fontSize: 16,
      // color: COLORS.text, // Handled inline
  },


});
