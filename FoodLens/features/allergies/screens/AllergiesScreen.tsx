import React from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import TravelerAllergyCard from '../../../components/TravelerAllergyCard';
import { Colors } from '../../../constants/theme';
import { useColorScheme } from '../../../hooks/use-color-scheme';
import AllergiesHeader from '../components/AllergiesHeader';
import {
    ALLERGIES_DESCRIPTION,
    ALLERGIES_TITLE,
    TRAVELER_CARD_PREVIEW_TITLE,
} from '../constants/allergies.constants';
import { useProfileScreen } from '@/features/profile/hooks/useProfileScreen';
import { useI18n } from '@/features/i18n';
import AllergenGrid from '@/features/profile/components/AllergenGrid';
import RestrictionInput from '@/features/profile/components/RestrictionInput';
import RestrictionTags from '@/features/profile/components/RestrictionTags';
import SaveProfileFooter from '@/features/profile/components/SaveProfileFooter';
import { allergiesStyles as styles } from '../styles/allergiesStyles';

export default function AllergiesScreen() {
    const { t } = useI18n();
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const {
        loading,
        allergies,
        otherRestrictions,
        inputValue,
        suggestions,
        scrollViewRef,
        toggleAllergen,
        handleInputChange,
        addOtherRestriction,
        selectSuggestion,
        removeRestriction,
        saveProfile,
    } = useProfileScreen();

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <Stack.Screen options={{ headerShown: false }} />

            <SafeAreaView style={{ flex: 1 }}>
                <AllergiesHeader title={ALLERGIES_TITLE} onBackPress={() => router.back()} theme={theme} />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    enabled={Platform.OS === 'ios'}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        ref={scrollViewRef}
                        contentContainerStyle={styles.content}
                        keyboardShouldPersistTaps="always"
                        keyboardDismissMode="on-drag"
                    >
                        <Text style={[styles.description, { color: theme.textSecondary }]}>{ALLERGIES_DESCRIPTION}</Text>

                        <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 12 }]}>
                            {t('profile.section.commonAllergens', 'Common Allergens')}
                        </Text>
                        <AllergenGrid theme={theme} selectedAllergies={allergies} onToggle={toggleAllergen} t={t} />

                        <View style={{ marginTop: 24 }}>
                            <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 12 }]}>
                                {t('profile.section.restrictions', 'Dietary Restrictions')}
                            </Text>
                            <RestrictionInput
                                theme={theme}
                                inputValue={inputValue}
                                suggestions={suggestions}
                                t={t}
                                onChangeText={handleInputChange}
                                onSubmit={addOtherRestriction}
                                onSelectSuggestion={selectSuggestion}
                            />
                            {otherRestrictions.length > 0 ? (
                                <RestrictionTags theme={theme} items={otherRestrictions} onRemove={removeRestriction} />
                            ) : (
                                <Text style={[styles.description, { color: theme.textSecondary, marginBottom: 16 }]}>
                                    {t(
                                        'profile.section.restrictionsEmpty',
                                        'No dietary restrictions added yet.',
                                    )}
                                </Text>
                            )}
                        </View>

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
                </KeyboardAvoidingView>
                <SaveProfileFooter theme={theme} loading={loading} onSave={saveProfile} t={t} />
            </SafeAreaView>
        </View>
    );
}
