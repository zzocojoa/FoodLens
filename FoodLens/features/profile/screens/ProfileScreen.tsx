import React from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleX } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import { useI18n } from '@/features/i18n';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AllergenGrid from '../components/AllergenGrid';
import ProfileHeader from '../components/ProfileHeader';
import RestrictionInput from '../components/RestrictionInput';
import RestrictionTags from '../components/RestrictionTags';
import SaveProfileFooter from '../components/SaveProfileFooter';
import { COMMON_ALLERGENS, SEVERITY_LEVELS } from '../constants/profile.constants';
import { useProfileScreen } from '../hooks/useProfileScreen';
import { profileStyles as styles } from '../styles/profileStyles';
import { resolveRestrictionDisplayName } from '../utils/profileSuggestions';

const COMMON_ALLERGEN_ID_SET = new Set(COMMON_ALLERGENS.map((item) => item.id));

export default function ProfileScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ fromProfileSheet?: string }>();
    const { t } = useI18n();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme];
    const insets = useSafeAreaInsets();
    const [showCustomAllergenSearch, setShowCustomAllergenSearch] = React.useState(false);

    const {
        loading,
        inputValue,
        customAllergenInputValue,
        allergies,
        severityMap,
        otherRestrictions,
        suggestions,
        customAllergenSuggestions,
        scrollViewRef,
        toggleAllergen,
        cycleSeverity,
        handleInputChange,
        handleCustomAllergenInputChange,
        addCustomAllergen,
        selectCustomAllergenSuggestion,
        addOtherRestriction,
        removeRestriction,
        selectSuggestion,
        saveProfile,
    } = useProfileScreen();

    const customAllergies = React.useMemo(
        () => allergies.filter((id) => !COMMON_ALLERGEN_ID_SET.has(id)),
        [allergies],
    );

    const handleBack = React.useCallback(() => {
        if (params.fromProfileSheet === '1') {
            router.replace({
                pathname: '/(tabs)',
                params: { openProfile: '1' },
            });
            return;
        }
        router.back();
    }, [params.fromProfileSheet, router]);

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
            <ProfileHeader theme={theme} onBack={handleBack} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                enabled={Platform.OS === 'ios'}
                style={{ flex: 1 }}
            >
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.container}
                    contentContainerStyle={{
                        paddingBottom: insets.bottom + 120,
                    }}
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode="on-drag"
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
                                    onSelectSuggestion={selectCustomAllergenSuggestion}
                                    t={t}
                                />
                            </View>
                        )}
                    </View>

                    {customAllergies.length > 0 && (
                        <View style={{ marginTop: 4, marginBottom: 8 }}>
                            <Text style={[styles.sectionHeader, { color: theme.textPrimary, fontSize: 16 }]}>
                                {t('profile.section.customAllergens', 'Additional Allergens')}
                            </Text>
                            <View style={styles.tagContainer}>
                                {customAllergies.map((id) => (
                                    <TouchableOpacity
                                        key={`custom-${id}`}
                                        style={[
                                            styles.tag,
                                            {
                                                backgroundColor: theme.surface,
                                                borderColor: theme.border,
                                            },
                                        ]}
                                        onPress={() => toggleAllergen(id)}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityLabel={t(
                                            'profile.accessibility.removeCustomAllergen',
                                            'Remove custom allergen',
                                        )}
                                        accessibilityHint={t(
                                            'profile.accessibility.removeCustomAllergenHint',
                                            'Tap to remove this custom allergen',
                                        )}
                                    >
                                        <Text style={[styles.tagText, { color: theme.textPrimary }]}>
                                            {t(`profile.allergen.${id}`, resolveRestrictionDisplayName(id, t))}
                                        </Text>
                                        <CircleX size={16} color={theme.textSecondary} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}

                    <View style={{ marginTop: 16, marginBottom: 8 }}>
                        <Text style={[styles.sectionHeader, { color: theme.textPrimary, fontSize: 16 }]}>
                            {t('profile.section.otherRestrictions', 'Other Restrictions')}
                        </Text>
                        <Text style={[styles.heroSubtitle, { color: theme.textSecondary, fontSize: 14, marginBottom: 12 }]}>
                            {t(
                                'profile.section.otherRestrictionsSubtitle',
                                'Add diets or ingredients you avoid, such as vegan, pork, or peach.',
                            )}
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
                    </View>

                    {otherRestrictions.length > 0 && (
                        <View style={{ marginTop: 8, marginBottom: 8 }}>
                            <RestrictionTags
                                theme={theme}
                                items={otherRestrictions}
                                t={t}
                                onRemove={removeRestriction}
                            />
                        </View>
                    )}

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
                                        accessibilityLabel={`${t(`profile.allergen.${id}`, resolveRestrictionDisplayName(id, t))} - ${t(`onboarding.severity.${level.key}`, level.label)}`}
                                        accessibilityHint={t(
                                            'onboarding.accessibility.severityCycleHint',
                                            'Tap to cycle severity level',
                                        )}
                                    >
                                        <Text style={[styles.severityAllergenName, { color: theme.textPrimary }]}>
                                            {t(`profile.allergen.${id}`, resolveRestrictionDisplayName(id, t))}
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
