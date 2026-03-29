import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import TravelerAllergyCard from '../../../components/TravelerAllergyCard';
import { Colors } from '../../../constants/theme';
import { useColorScheme } from '../../../hooks/use-color-scheme';
import AllergiesHeader from '../components/AllergiesHeader';
import AllergyListSection from '../components/AllergyListSection';
import { ALLERGIES_COPY } from '../constants/allergies.constants';
import { useAllergiesData } from '../hooks/useAllergiesData';
import { allergiesStyles as styles } from '../styles/allergiesStyles';
import { useI18n } from '@/features/i18n';

const toTravelerPreviewCountryCode = (locale?: string): string => {
    const normalized = (locale || '').trim().toLowerCase();
    if (normalized.startsWith('ko')) return 'KR';
    if (normalized.startsWith('ja')) return 'JP';
    if (normalized.startsWith('zh')) return 'CN';
    if (normalized.startsWith('th')) return 'TH';
    if (normalized.startsWith('vi')) return 'VN';
    return 'US';
};

export default function AllergiesScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { t, locale } = useI18n();
    const { allergies, dietaryRestrictions, severityMap, loading } = useAllergiesData();
    const previewCountryCode = toTravelerPreviewCountryCode(locale);
    const handleEditProfile = React.useCallback(() => {
        router.push('/profile');
    }, [router]);

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <Stack.Screen options={{ headerShown: false }} />

            <SafeAreaView style={{ flex: 1 }}>
                <AllergiesHeader
                    title={t(ALLERGIES_COPY.title.key, ALLERGIES_COPY.title.fallback)}
                    onBackPress={() => router.back()}
                    theme={theme}
                />

                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={[styles.description, { color: theme.textSecondary }]}>
                        {t(ALLERGIES_COPY.description.key, ALLERGIES_COPY.description.fallback)}
                    </Text>

                    <TouchableOpacity
                        style={[styles.editButton, { backgroundColor: theme.primary }]}
                        onPress={handleEditProfile}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.editButtonText}>
                            {t('allergies.action.edit', 'Edit Health Profile')}
                        </Text>
                    </TouchableOpacity>

                    <AllergyListSection
                        loading={loading}
                        allergies={allergies}
                        dietaryRestrictions={dietaryRestrictions}
                        severityMap={severityMap}
                        theme={theme}
                        onPressEdit={handleEditProfile}
                    />

                    {!loading && (
                        <>
                            <View style={styles.sectionHeader}>
                                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                                    {t(
                                        ALLERGIES_COPY.travelerCardPreviewTitle.key,
                                        ALLERGIES_COPY.travelerCardPreviewTitle.fallback
                                    )}
                                </Text>
                            </View>

                            <TravelerAllergyCard countryCode={previewCountryCode} aiTranslation={null} />
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}
