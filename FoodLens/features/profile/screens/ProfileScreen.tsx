import React from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    LayoutChangeEvent,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleX, Pencil, Plus } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import { useI18n } from '@/features/i18n';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PearlSurfaceOverlay } from '@/features/home/components/PearlSurfaceOverlay';
import { homeDashboardColors } from '@/features/home/components/homeDashboardTokens';
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

const resolveSeverityItemName = (
    id: string,
    t: (key: string, fallback: string) => string,
): string => t(`profile.allergen.${id}`, resolveRestrictionDisplayName(id, t));

const replaceCountTemplate = (template: string, count: number): string => {
    return template.replace('{count}', String(count));
};

export default function ProfileScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ fromProfileSheet?: string }>();
    const { t } = useI18n();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme];
    const insets = useSafeAreaInsets();
    const [showCustomAllergenSearch, setShowCustomAllergenSearch] = React.useState(false);
    const [isKeyboardVisible, setIsKeyboardVisible] = React.useState(false);
    const customAllergenSectionYRef = React.useRef<number | null>(null);

    const {
        loading,
        inputValue,
        customAllergenInputValue,
        allergies,
        severityMap,
        otherRestrictions,
        severityItems,
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
    const scrollToCustomAllergenSearch = React.useCallback((): void => {
        const customAllergenSectionY = customAllergenSectionYRef.current;

        if (customAllergenSectionY === null) {
            return;
        }

        scrollViewRef.current?.scrollTo({
            y: Math.max(customAllergenSectionY - 24, 0),
            animated: true,
        });
    }, [scrollViewRef]);
    const handleShowCustomAllergenSearch = React.useCallback((): void => {
        setShowCustomAllergenSearch(true);
        requestAnimationFrame(scrollToCustomAllergenSearch);
    }, [scrollToCustomAllergenSearch]);
    const handleCustomAllergenSectionLayout = React.useCallback((event: LayoutChangeEvent): void => {
        customAllergenSectionYRef.current = event.nativeEvent.layout.y;
    }, []);
    const handleBack = React.useCallback((): void => {
        if (params.fromProfileSheet === '1') {
            router.replace({
                pathname: '/(tabs)',
                params: { openProfile: '1' },
            });
            return;
        }
        router.back();
    }, [params.fromProfileSheet, router]);
    React.useEffect((): (() => void) => {
        const showEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSubscription = Keyboard.addListener(showEventName, () => setIsKeyboardVisible(true));
        const hideSubscription = Keyboard.addListener(hideEventName, () => setIsKeyboardVisible(false));

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
            <ProfileHeader theme={theme} onBack={handleBack} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                enabled={true}
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
                    <View style={styles.summaryPanel}>
                        <PearlSurfaceOverlay
                            accentWashColor={homeDashboardColors.pearlMist}
                            baseBottomColor={homeDashboardColors.paperStrong}
                            baseTopColor={homeDashboardColors.pearlIvory}
                            coolWashColor={homeDashboardColors.pearlSage}
                            warmWashColor={homeDashboardColors.pearlPeach}
                        />
                        <View style={styles.summaryPanelContent}>
                            <View style={styles.summaryPanelHeader}>
                                <Text style={styles.summaryEyebrow}>
                                    {t('profile.summary.eyebrow', 'Health profile')}
                                </Text>
                                <Text style={styles.summaryTitle}>
                                    {t('profile.summary.title', 'Review what FoodLens should protect')}
                                </Text>
                                <Text style={styles.summaryDescription}>
                                    {t(
                                        'profile.summary.description',
                                        'Keep allergies, custom allergens, and dietary restrictions current before scanning.',
                                    )}
                                </Text>
                            </View>

                            <View style={styles.summaryMetricRow}>
                                <View style={styles.summaryMetricPill}>
                                    <Text style={styles.summaryMetricText}>
                                        {replaceCountTemplate(
                                            t('profile.summary.allergiesTemplate', '{count} allergies'),
                                            allergies.length,
                                        )}
                                    </Text>
                                </View>
                                <View style={styles.summaryMetricPill}>
                                    <Text style={styles.summaryMetricText}>
                                        {replaceCountTemplate(
                                            t('profile.summary.customTemplate', '{count} custom'),
                                            customAllergies.length,
                                        )}
                                    </Text>
                                </View>
                                <View style={styles.summaryMetricPill}>
                                    <Text style={styles.summaryMetricText}>
                                        {replaceCountTemplate(
                                            t('profile.summary.restrictionsTemplate', '{count} restrictions'),
                                            otherRestrictions.length,
                                        )}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.editActionRow}>
                                <TouchableOpacity
                                    style={styles.editActionButton}
                                    onPress={handleShowCustomAllergenSearch}
                                    accessibilityRole="button"
                                    accessibilityLabel={t(
                                        'profile.accessibility.editCustomAllergens',
                                        'Edit custom allergens',
                                    )}
                                    accessibilityHint={t(
                                        'profile.accessibility.editCustomAllergensHint',
                                        'Shows the custom allergen search field',
                                    )}
                                >
                                    <Plus size={17} color={homeDashboardColors.paper} />
                                    <Text style={styles.editActionText}>
                                        {t('profile.action.editCustomAllergens', 'Custom allergen')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.editActionButton, styles.editActionButtonSecondary]}
                                    onPress={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                                    accessibilityRole="button"
                                    accessibilityLabel={t(
                                        'profile.accessibility.editRestrictions',
                                        'Edit dietary restrictions',
                                    )}
                                    accessibilityHint={t(
                                        'profile.accessibility.editRestrictionsHint',
                                        'Moves to the dietary restrictions field',
                                    )}
                                >
                                    <Pencil size={17} color={homeDashboardColors.ink} />
                                    <Text style={[styles.editActionText, styles.editActionTextSecondary]}>
                                        {t('profile.action.editRestrictions', 'Restrictions')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

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

                    <View
                        onLayout={handleCustomAllergenSectionLayout}
                        style={{ marginTop: 24, paddingBottom: 8 }}
                    >
                        {!showCustomAllergenSearch ? (
                            <TouchableOpacity
                                style={styles.searchToggleButton}
                                onPress={handleShowCustomAllergenSearch}
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
                                            {resolveSeverityItemName(id, t)}
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

                    {severityItems.length > 0 && (
                        <View style={{ marginTop: 8, marginBottom: 8 }}>
                            <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>
                                {t('onboarding.allergies.severityTitle', 'Set Severity Level')}
                            </Text>
                            <Text style={[styles.severityHint, { color: theme.textSecondary }]}>
                                {t('onboarding.allergies.severityHint', 'Tap to cycle: Mild → Moderate → Severe')}
                            </Text>
                            {severityItems.map((id, index) => {
                                const severity = severityMap[id] || 'moderate';
                                const level = SEVERITY_LEVELS.find((entry) => entry.key === severity)!;
                                const itemName = resolveSeverityItemName(id, t);
                                return (
                                    <TouchableOpacity
                                        key={`${id}-${index}`}
                                        style={[
                                            styles.severityRow,
                                            { backgroundColor: theme.surface, borderColor: `${level.color}40` },
                                        ]}
                                        onPress={() => cycleSeverity(id)}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${itemName} - ${t(`onboarding.severity.${level.key}`, level.label)}`}
                                        accessibilityHint={t(
                                            'onboarding.accessibility.severityCycleHint',
                                            'Tap to cycle severity level',
                                        )}
                                    >
                                        <View style={styles.severityRowHeader}>
                                            <Text style={[styles.severityAllergenName, { color: theme.textPrimary }]}>
                                                {itemName}
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
                                        </View>
                                        <View style={styles.severitySegmentRow}>
                                            {SEVERITY_LEVELS.map((entry) => {
                                                const isActive = entry.key === severity;

                                                return (
                                                    <View
                                                        key={`${id}-${entry.key}`}
                                                        style={[
                                                            styles.severitySegment,
                                                            {
                                                                backgroundColor: isActive
                                                                    ? `${entry.color}20`
                                                                    : theme.background,
                                                                borderColor: isActive ? entry.color : theme.border,
                                                            },
                                                        ]}
                                                        accessibilityElementsHidden={true}
                                                        importantForAccessibility="no-hide-descendants"
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.severitySegmentText,
                                                                { color: isActive ? entry.color : theme.textSecondary },
                                                            ]}
                                                        >
                                                            {t(`onboarding.severity.${entry.key}`, entry.label)}
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            {!isKeyboardVisible && (
                <SaveProfileFooter
                    theme={theme}
                    loading={loading}
                    onSave={saveProfile}
                    t={t}
                />
            )}
        </SafeAreaView>
    );
}
