import React from 'react';
import {
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import AllergenGrid from '../components/AllergenGrid';
import ProfileHeader from '../components/ProfileHeader';
import RestrictionInput from '../components/RestrictionInput';
import SaveProfileFooter from '../components/SaveProfileFooter';
import { useProfileScreen } from '../hooks/useProfileScreen';
import { profileStyles as styles } from '../styles/profileStyles';
import { SEVERITY_LEVELS } from '../constants/profile.constants';
import { useI18n } from '@/features/i18n';

export default function ProfileScreen() {
    const router = useRouter();
    const { t } = useI18n();
    const { colorScheme } = useTheme();
    const theme = Colors[colorScheme];
    const insets = useSafeAreaInsets();
    const [showCustomAllergenSearch, setShowCustomAllergenSearch] = React.useState(false);

    const {
        loading,
        customAllergenInputValue,
        allergies,
        severityMap,
        customAllergenSuggestions,
        scrollViewRef,
        toggleAllergen,
        cycleSeverity,
        handleCustomAllergenInputChange,
        addCustomAllergen,
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
                        paddingBottom: insets.bottom + 120,
                    }}
                    keyboardShouldPersistTaps="handled"
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

                    <View style={{ marginTop: 24, paddingBottom: 8 }}>
                        {!showCustomAllergenSearch ? (
                            <TouchableOpacity
                                style={styles.searchToggleButton}
                                onPress={() => setShowCustomAllergenSearch(true)}
                                accessibilityRole="button"
                                accessibilityLabel={t('onboarding.allergies.notFound', 'Not finding yours?')}
                                accessibilityHint={t(
                                    'onboarding.accessibility.searchAllergenHint',
                                    'Open search to add a custom allergen',
                                )}
                            >
                                <Text style={[styles.searchToggleText, { color: theme.tint }]}>
                                    {t('onboarding.allergies.notFound', 'Not finding yours?')}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View>
                                <Text style={[styles.sectionHeader, { color: theme.textPrimary, fontSize: 16 }]}>
                                    {t('onboarding.allergies.searchTitle', 'Search additional allergens')}
                                </Text>
                                <RestrictionInput
                                    theme={theme}
                                    inputValue={customAllergenInputValue}
                                    suggestions={customAllergenSuggestions}
                                    onChangeText={handleCustomAllergenInputChange}
                                    onSubmit={() => addCustomAllergen(customAllergenInputValue)}
                                    onSelectSuggestion={addCustomAllergen}
                                    t={t}
                                />
                            </View>
                        )}
                    </View>

                    {allergies.length > 0 && (
                        <View style={{ marginTop: 8, marginBottom: 8 }}>
                            <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>
                                {t('onboarding.allergies.severityTitle', 'Set Severity Level')}
                            </Text>
                            <Text style={[styles.severityHint, { color: theme.textSecondary }]}>
                                {t('onboarding.allergies.severityHint', 'Tap to cycle: Mild → Moderate → Severe')}
                            </Text>
                            {allergies.map((id) => {
                                const severity = severityMap[id] || 'moderate';
                                const level = SEVERITY_LEVELS.find((entry) => entry.key === severity)!;
                                return (
                                    <TouchableOpacity
                                        key={id}
                                        style={[
                                            styles.severityRow,
                                            { backgroundColor: theme.surface, borderColor: `${level.color}40` },
                                        ]}
                                        onPress={() => cycleSeverity(id)}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${t(`profile.allergen.${id}`, `${id.charAt(0).toUpperCase()}${id.slice(1)}`)} - ${t(`onboarding.severity.${level.key}`, level.label)}`}
                                        accessibilityHint={t(
                                            'onboarding.accessibility.severityCycleHint',
                                            'Tap to cycle severity level',
                                        )}
                                    >
                                        <Text style={[styles.severityAllergenName, { color: theme.textPrimary }]}>
                                            {t(`profile.allergen.${id}`, `${id.charAt(0).toUpperCase()}${id.slice(1)}`)}
                                        </Text>
                                        <View
                                            style={[
                                                styles.severityBadge,
                                                { backgroundColor: `${level.color}20`, borderColor: level.color },
                                            ]}
                                        >
                                            <Text style={{ fontSize: 14 }}>{level.emoji}</Text>
                                            <Text style={[styles.severityBadgeText, { color: level.color }]}>
                                                {t(`onboarding.severity.${level.key}`, level.label)}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

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

            <SaveProfileFooter
                theme={theme}
                loading={loading}
                onSave={saveProfile}
                t={t}
            />
        </SafeAreaView>
    );
}
