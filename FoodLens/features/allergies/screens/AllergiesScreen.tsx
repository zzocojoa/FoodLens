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
import {
    ALLERGIES_DESCRIPTION,
    ALLERGIES_TITLE,
    TRAVELER_CARD_PREVIEW_TITLE,
} from '../constants/allergies.constants';
import { useAllergiesData } from '../hooks/useAllergiesData';
import { allergiesStyles as styles } from '../styles/allergiesStyles';

export default function AllergiesScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { allergies, loading } = useAllergiesData();

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <Stack.Screen options={{ headerShown: false }} />

            <SafeAreaView style={{ flex: 1 }}>
                <AllergiesHeader title={ALLERGIES_TITLE} onBackPress={() => router.back()} theme={theme} />

                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={[styles.description, { color: theme.textSecondary }]}>{ALLERGIES_DESCRIPTION}</Text>

                    <AllergyListSection loading={loading} allergies={allergies} theme={theme} />

                    {!loading && (
                        <>
                            <View style={styles.sectionHeader}>
                                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                                    {TRAVELER_CARD_PREVIEW_TITLE}
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

