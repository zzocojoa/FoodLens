import React from 'react';
import { View, Text, ScrollView } from 'react-native';
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

export default function AllergiesScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { t } = useI18n();
    const { allergies, loading } = useAllergiesData();

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

                    <AllergyListSection loading={loading} allergies={allergies} theme={theme} />

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

                            <TravelerAllergyCard countryCode="US" aiTranslation={null} />
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}
