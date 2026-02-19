import React from 'react';
import {
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    Text,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import AllergenGrid from '../components/AllergenGrid';
import ProfileHeader from '../components/ProfileHeader';
import RestrictionInput from '../components/RestrictionInput';
import RestrictionTags from '../components/RestrictionTags';
import SaveProfileFooter from '../components/SaveProfileFooter';
import { useProfileScreen } from '../hooks/useProfileScreen';
import { profileStyles as styles } from '../styles/profileStyles';
import { useI18n } from '@/features/i18n';

export default function ProfileScreen() {
    const router = useRouter();
    const { t } = useI18n();
    const { colorScheme } = useTheme();
    const theme = Colors[colorScheme];
    const insets = useSafeAreaInsets();

    const {
        loading,
        inputValue,
        allergies,
        otherRestrictions,
        suggestions,
        scrollViewRef,
        shouldScrollRef,
        toggleAllergen,
        handleInputChange,
        addOtherRestriction,
        removeRestriction,
        selectSuggestion,
        saveProfile,
    } = useProfileScreen();

    const handleOpenPrivacyPolicy = () => {
        Linking.openURL('https://zzocojoa.github.io/FoodLens/docs/privacy-policy/');
    };

    const handleOpenTermsOfService = () => {
        Linking.openURL('https://zzocojoa.github.io/FoodLens/docs/terms-of-service/');
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
            <ProfileHeader theme={theme} onBack={() => router.back()} />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.container}
                    contentContainerStyle={{
                        paddingBottom: otherRestrictions.length === 0 ? insets.bottom + 40 : insets.bottom + 150,
                    }}
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => {
                        if (shouldScrollRef.current) {
                            scrollViewRef.current?.scrollToEnd({ animated: true });
                            shouldScrollRef.current = false;
                        }
                    }}
                >
                    <View style={styles.heroSection}>
                        <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>
                            {t('profile.hero.title', 'What should we avoid?')}
                        </Text>
                        <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
                            {t('profile.hero.subtitle', 'Select ingredients you are allergic to or cannot eat.')}
                        </Text>
                    </View>

                    <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>
                        {t('profile.section.commonAllergens', 'Common Allergens')}
                    </Text>
                    <AllergenGrid
                        theme={theme}
                        selectedAllergies={allergies}
                        onToggle={toggleAllergen}
                        t={t}
                    />

                    <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>
                        {t('profile.section.otherRestrictions', 'Other Restrictions')}
                    </Text>
                    <RestrictionInput
                        theme={theme}
                        inputValue={inputValue}
                        suggestions={suggestions}
                        onChangeText={handleInputChange}
                        onSubmit={addOtherRestriction}
                        onSelectSuggestion={selectSuggestion}
                        t={t}
                    />

                    <RestrictionTags theme={theme} items={otherRestrictions} onRemove={removeRestriction} />

                    <View style={{ marginTop: 40, paddingBottom: 20 }}>
                        <Text style={[styles.sectionHeader, { color: theme.textPrimary, marginBottom: 12 }]}>
                            {t('profile.section.legal', 'Legal')}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 16 }}>
                            <Text
                                style={{ color: theme.tint, fontSize: 14, textDecorationLine: 'underline' }}
                                onPress={handleOpenPrivacyPolicy}
                            >
                                {t('profile.legal.privacy', 'Privacy Policy')}
                            </Text>
                            <Text
                                style={{ color: theme.tint, fontSize: 14, textDecorationLine: 'underline' }}
                                onPress={handleOpenTermsOfService}
                            >
                                {t('profile.legal.terms', 'Terms of Service')}
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            <SaveProfileFooter theme={theme} loading={loading} onSave={saveProfile} t={t} />
        </SafeAreaView>
    );
}
