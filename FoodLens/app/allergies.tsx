import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ShieldAlert, CheckCircle2 } from 'lucide-react-native';
import { UserService } from '../services/userService';
import { ALLERGEN_TERMS } from '../services/staticTranslations';
import TravelerAllergyCard from '../components/TravelerAllergyCard';
import { Colors } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';

export default function AllergiesScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const [allergies, setAllergies] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAllergies();
    }, []);

    const loadAllergies = async () => {
        try {
            // Hardcoded user ID as per current app logic
            const profile = await UserService.getUserProfile("test-user-v1");
            if (profile) {
                const combined = [
                    ...profile.safetyProfile.allergies,
                    ...profile.safetyProfile.dietaryRestrictions
                ];
                setAllergies(combined);
            }
        } catch (e) {
            console.error("Failed to load allergies", e);
        } finally {
            setLoading(false);
        }
    };

    const getKoreanName = (englishTerm: string) => {
        // Normalize
        const key = englishTerm.trim();
        // Try exact match in keys
        // ALLERGEN_TERMS keys are like 'Peanuts', 'Milk'
        // If stored as lowercase 'peanuts', we need to match key
        
        // Find matching key case-insensitive
        const dictKey = Object.keys(ALLERGEN_TERMS).find(k => k.toLowerCase() === key.toLowerCase());
        
        if (dictKey && ALLERGEN_TERMS[dictKey]['KR']) {
            return ALLERGEN_TERMS[dictKey]['KR'];
        }
        return englishTerm; // Fallback
    };

    return (
        <View style={[styles.container, {backgroundColor: theme.background}]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <Stack.Screen options={{ headerShown: false }} />
            
            <SafeAreaView style={{ flex: 1 }}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, {backgroundColor: theme.glass, borderColor: theme.border}]}>
                        <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, {color: theme.textPrimary}]}>My Allergies</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    
                    {/* Intro */}
                    <Text style={[styles.description, {color: theme.textSecondary}]}>
                        등록된 알레르기 및 식단 제한 정보입니다.{'\n'}
                        이 정보를 바탕으로 AI가 음식의 안전성을 분석합니다.
                    </Text>

                    {loading ? (
                        <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
                    ) : (
                        <>
                            {allergies.length > 0 ? (
                                <View style={styles.listContainer}>
                                    {allergies.map((item, index) => (
                                        <View key={index} style={[styles.allergyItem, {backgroundColor: theme.surface, borderColor: theme.border}]}>
                                            <View style={[styles.iconBox, {backgroundColor: theme.background}]}>
                                                <ShieldAlert size={20} color="#E11D48" />
                                            </View>
                                            <View>
                                                <Text style={[styles.allergyNameKr, {color: theme.textPrimary}]}>{getKoreanName(item)}</Text>
                                                <Text style={[styles.allergyNameEn, {color: theme.textSecondary}]}>{item}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <View style={[styles.emptyState, {backgroundColor: theme.surface, borderColor: theme.border}]}>
                                    <CheckCircle2 size={48} color="#10B981" />
                                    <Text style={[styles.emptyTitle, {color: theme.textPrimary}]}>All Clear!</Text>
                                    <Text style={[styles.emptyDesc, {color: theme.textSecondary}]}>등록된 알레르기 정보가 없습니다.</Text>
                                </View>
                            )}

                            {/* Traveler Card Preview */}
                            <View style={styles.sectionHeader}>
                                <Text style={[styles.sectionTitle, {color: theme.textPrimary}]}>Traveler Card Preview</Text>
                            </View>
                            
                            {/* Force display US/English card as example/default */}
                            <TravelerAllergyCard 
                                countryCode="US" 
                                aiTranslation={null} 
                            />
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor set dynamically
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
    },
    content: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    description: {
        fontSize: 14,
        color: '#64748B',
        lineHeight: 22,
        marginBottom: 32,
        textAlign: 'center',
    },
    listContainer: {
        gap: 12,
        marginBottom: 40,
    },
    allergyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        gap: 16,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    allergyNameKr: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
    },
    allergyNameEn: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
        textTransform: 'capitalize',
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
        borderRadius: 24,
        borderWidth: 1,
        marginBottom: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
        marginTop: 16,
        marginBottom: 4,
    },
    emptyDesc: {
        color: '#64748B',
    },
    sectionHeader: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    }
});
