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
import { Check, ChevronRight, CircleX, Plus, ShieldCheck } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import { useI18n } from '@/features/i18n';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { HomeBackgroundAtmosphere } from '@/features/home/components/HomeBackgroundAtmosphere';
import { PearlSurfaceOverlay } from '@/features/home/components/PearlSurfaceOverlay';
import {
    homeDashboardColors,
    homeDashboardSignalColors,
} from '@/features/home/components/homeDashboardTokens';
import AllergenGrid from '../components/AllergenGrid';
import ProfileHeader from '../components/ProfileHeader';
import RestrictionInput from '../components/RestrictionInput';
import SaveProfileFooter from '../components/SaveProfileFooter';
import { COMMON_ALLERGENS } from '../constants/profile.constants';
import { useProfileScreen } from '../hooks/useProfileScreen';
import { profileStyles as styles } from '../styles/profileStyles';
import { AllergySeverity } from '../types/profile.types';
import { resolveRestrictionDisplayName } from '../utils/profileSuggestions';

const COMMON_ALLERGEN_ID_SET = new Set(COMMON_ALLERGENS.map((item) => item.id));

const resolveSeverityItemName = (
    id: string,
    t: (key: string, fallback: string) => string,
): string => t(`profile.allergen.${id}`, resolveRestrictionDisplayName(id, t));

const replaceCountTemplate = (template: string, count: number): string => {
    return template.replace('{count}', String(count));
};

const replaceItemTemplate = (template: string, item: string): string => {
    return template.replace('{item}', item);
};

const getSeverityFallback = (severity: AllergySeverity): string => {
    if (severity === 'severe') {
        return 'Severe';
    }

    if (severity === 'moderate') {
        return 'Moderate';
    }

    return 'Mild';
};

type LedgerItem = {
    id: string;
    kind: 'allergen' | 'restriction' | 'mixed';
};

type SeverityTone = {
    backgroundColor: string;
    borderColor: string;
    iconColor: string;
    textColor: string;
};

const getSeverityTone = (severity: AllergySeverity): SeverityTone => {
    if (severity === 'severe') {
        return {
            backgroundColor: homeDashboardSignalColors.DANGER.background,
            borderColor: homeDashboardColors.accentRed,
            iconColor: homeDashboardColors.accentRed,
            textColor: homeDashboardColors.accentRed,
        };
    }

    if (severity === 'moderate') {
        return {
            backgroundColor: homeDashboardSignalColors.CAUTION.background,
            borderColor: homeDashboardColors.accentAmber,
            iconColor: homeDashboardColors.accentAmber,
            textColor: homeDashboardColors.accentAmber,
        };
    }

    return {
        backgroundColor: homeDashboardSignalColors.SAFE.background,
        borderColor: homeDashboardColors.accentGreen,
        iconColor: homeDashboardColors.accentGreen,
        textColor: homeDashboardColors.accentGreen,
    };
};

const buildLedgerItems = (allergies: string[], otherRestrictions: string[]): LedgerItem[] => {
    const ids = [...allergies, ...otherRestrictions].reduce<string[]>((items, item) => {
        if (items.includes(item)) {
            return items;
        }

        return [...items, item];
    }, []);

    return ids.map((id) => {
        const isAllergen = allergies.includes(id);
        const isRestriction = otherRestrictions.includes(id);

        if (isAllergen && isRestriction) {
            return { id, kind: 'mixed' };
        }

        if (isAllergen) {
            return { id, kind: 'allergen' };
        }

        return { id, kind: 'restriction' };
    });
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
        isDirty,
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
    const ledgerItems = React.useMemo(
        () => buildLedgerItems(allergies, otherRestrictions),
        [allergies, otherRestrictions],
    );
    const severeCount = React.useMemo(
        () => ledgerItems.filter((item) => (severityMap[item.id] || 'moderate') === 'severe').length,
        [ledgerItems, severityMap],
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
        <SafeAreaView style={styles.safeArea}>
            <HomeBackgroundAtmosphere />
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
                    <View style={styles.statusRail}>
                        <Text style={styles.statusRailText}>
                            {isDirty
                                ? t('profile.health.unsaved', 'Unsaved changes')
                                : t('profile.health.saved', 'Saved')}
                        </Text>
                        <Text style={styles.statusRailDivider}>/</Text>
                        <Text style={styles.statusRailText}>
                            {replaceCountTemplate(
                                t('profile.health.totalTemplate', '{count} items'),
                                ledgerItems.length,
                            )}
                        </Text>
                    </View>

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
                                <Text style={styles.summaryTitle}>
                                    {t('profile.health.summary.title', 'FoodLens safety criteria')}
                                </Text>
                                <Text style={styles.summaryDescription}>
                                    {t(
                                        'profile.health.summary.subtitle',
                                        'Scans use these items to flag food that needs caution.',
                                    )}
                                </Text>
                            </View>

                            <View style={styles.summaryMetricRow}>
                                <View style={styles.summaryMetricPill}>
                                    <Text style={styles.summaryMetricText}>
                                        {replaceCountTemplate(
                                            t('profile.health.allergiesTemplate', '{count} allergies'),
                                            allergies.length,
                                        )}
                                    </Text>
                                </View>
                                <View style={styles.summaryMetricPill}>
                                    <Text style={styles.summaryMetricText}>
                                        {replaceCountTemplate(
                                            t('profile.health.customTemplate', '{count} custom'),
                                            customAllergies.length,
                                        )}
                                    </Text>
                                </View>
                                <View style={styles.summaryMetricPill}>
                                    <Text style={styles.summaryMetricText}>
                                        {replaceCountTemplate(
                                            t('profile.health.severeTemplate', '{count} severe'),
                                            severeCount,
                                        )}
                                    </Text>
                                </View>
                                <View style={styles.summaryMetricPill}>
                                    <Text style={styles.summaryMetricText}>
                                        {replaceCountTemplate(
                                            t('profile.health.restrictionsTemplate', '{count} restrictions'),
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
                                        {t('profile.health.addAllergen', 'Add allergen')}
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
                                    <ChevronRight size={17} color={homeDashboardColors.ink} />
                                    <Text style={[styles.editActionText, styles.editActionTextSecondary]}>
                                        {t('profile.health.addRestriction', 'Add restriction')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <View style={styles.ledgerSection}>
                        <View style={styles.sectionTitleRow}>
                            <View>
                                <Text style={styles.sectionHeader}>
                                    {t('profile.health.selected.title', 'Protection ledger')}
                                </Text>
                                <Text style={styles.sectionSubtext}>
                                    {t('profile.health.selected.subtitle', 'Review selected items and their severity.')}
                                </Text>
                            </View>
                        </View>

                        {ledgerItems.length === 0 ? (
                            <View style={styles.emptyLedgerCard}>
                                <ShieldCheck size={22} color={homeDashboardColors.inkSoft} />
                                <View style={styles.emptyLedgerTextGroup}>
                                    <Text style={styles.emptyLedgerTitle}>
                                        {t('profile.health.empty.title', 'No items yet')}
                                    </Text>
                                    <Text style={styles.emptyLedgerBody}>
                                        {t('profile.health.empty.body', 'Add allergens or diet limits before scanning.')}
                                    </Text>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.ledgerList}>
                                {ledgerItems.map((item) => {
                                    const severity = severityMap[item.id] || 'moderate';
                                    const tone = getSeverityTone(severity);
                                    const severityLabel = t(
                                        `profile.health.severity.${severity}`,
                                        getSeverityFallback(severity),
                                    );
                                    const itemName = resolveSeverityItemName(item.id, t);
                                    const kindLabel = item.kind === 'restriction'
                                        ? t('profile.health.kind.restriction', 'Diet')
                                        : item.kind === 'mixed'
                                            ? t('profile.health.kind.mixed', 'Allergen + diet')
                                            : t('profile.health.kind.allergen', 'Allergen');
                                    const handleRemove = (): void => {
                                        if (item.kind === 'restriction' || item.kind === 'mixed') {
                                            removeRestriction(item.id);
                                            return;
                                        }

                                        toggleAllergen(item.id);
                                    };

                                    return (
                                        <View key={`ledger-${item.id}`} style={styles.ledgerRow}>
                                            <TouchableOpacity
                                                style={styles.ledgerMainButton}
                                                onPress={() => cycleSeverity(item.id)}
                                                activeOpacity={0.72}
                                                accessibilityRole="button"
                                                accessibilityLabel={`${itemName}, ${kindLabel}, ${severityLabel}`}
                                                accessibilityHint={t(
                                                    'profile.health.severityHint',
                                                    'Changes severity level',
                                                )}
                                            >
                                                <View style={styles.ledgerItemTextGroup}>
                                                    <Text style={styles.ledgerItemName}>{itemName}</Text>
                                                    <Text style={styles.ledgerItemKind}>{kindLabel}</Text>
                                                </View>
                                                <View
                                                    style={[
                                                        styles.inlineSeverityPill,
                                                        {
                                                            backgroundColor: tone.backgroundColor,
                                                            borderColor: tone.borderColor,
                                                        },
                                                    ]}
                                                >
                                                    <Check size={13} color={tone.iconColor} />
                                                    <Text style={[styles.inlineSeverityText, { color: tone.textColor }]}>
                                                        {severityLabel}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.ledgerRemoveButton}
                                                onPress={handleRemove}
                                                accessibilityRole="button"
                                                accessibilityLabel={replaceItemTemplate(
                                                    t('profile.health.removeItemTemplate', 'Remove {item}'),
                                                    itemName,
                                                )}
                                            >
                                                <CircleX size={19} color={homeDashboardColors.inkSoft} />
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>

                    <View style={styles.editorSection}>
                        <Text style={styles.sectionHeader}>
                            {t('profile.health.commonAllergens.title', 'Common allergens')}
                        </Text>
                        <AllergenGrid
                            selectedAllergies={allergies}
                            onToggle={toggleAllergen}
                            t={t}
                        />
                    </View>

                    <View
                        onLayout={handleCustomAllergenSectionLayout}
                        style={styles.editorSection}
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
                                <Plus size={17} color={homeDashboardColors.ink} />
                                <Text style={styles.searchToggleText}>
                                    {t('profile.health.customAllergen.title', 'Add another allergen')}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View>
                                <Text style={styles.sectionHeader}>
                                    {t('profile.health.customAllergen.title', 'Add another allergen')}
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

                    <View style={styles.editorSection}>
                        <Text style={styles.sectionHeader}>
                            {t('profile.health.dietary.title', 'Dietary restrictions')}
                        </Text>
                        <Text style={styles.sectionSubtext}>
                            {t(
                                'profile.health.dietary.subtitle',
                                'Add diets or ingredients you avoid.',
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
                </ScrollView>
            </KeyboardAvoidingView>

            {!isKeyboardVisible && (
                <SaveProfileFooter
                    theme={theme}
                    loading={loading}
                    isDirty={isDirty}
                    onSave={saveProfile}
                    t={t}
                />
            )}
        </SafeAreaView>
    );
}
