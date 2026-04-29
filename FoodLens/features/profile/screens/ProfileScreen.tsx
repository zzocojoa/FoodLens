import React from 'react';
import {
    Animated,
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
import { StatusBar } from 'expo-status-bar';
import { Check, CircleX, Plus, ShieldCheck } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import { useI18n } from '@/features/i18n';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { HomeBackgroundAtmosphere } from '@/features/home/components/HomeBackgroundAtmosphere';
import { PearlSurfaceOverlay } from '@/features/home/components/PearlSurfaceOverlay';
import {
    getHomeDashboardColors,
    getHomeDashboardSignalColors,
    homeDashboardColors,
    type HomeDashboardColors,
} from '@/features/home/components/homeDashboardTokens';
import AllergenGrid from '../components/AllergenGrid';
import ProfileHeader from '../components/ProfileHeader';
import RestrictionInput from '../components/RestrictionInput';
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
};

type SeverityTone = {
    backgroundColor: string;
    borderColor: string;
    iconColor: string;
    textColor: string;
};

const getSeverityTone = (
    severity: AllergySeverity,
    colors: HomeDashboardColors,
): SeverityTone => {
    const signalColors = getHomeDashboardSignalColors(colors);

    if (severity === 'severe') {
        return {
            backgroundColor: signalColors.DANGER.background,
            borderColor: colors.accentRed,
            iconColor: colors.accentRed,
            textColor: colors.accentRed,
        };
    }

    if (severity === 'moderate') {
        return {
            backgroundColor: signalColors.CAUTION.background,
            borderColor: colors.accentAmber,
            iconColor: colors.accentAmber,
            textColor: colors.accentAmber,
        };
    }

    return {
        backgroundColor: signalColors.SAFE.background,
        borderColor: colors.accentGreen,
        iconColor: colors.accentGreen,
        textColor: colors.accentGreen,
    };
};

const buildLedgerItems = (allergies: string[]): LedgerItem[] => {
    const ids = allergies.reduce<string[]>((items, item) => {
        if (items.includes(item)) {
            return items;
        }

        return [...items, item];
    }, []);

    return ids.map((id) => ({ id }));
};

export default function ProfileScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ fromProfileSheet?: string }>();
    const { t } = useI18n();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme];
    const isDarkTheme = colorScheme === 'dark';
    const dashboardColors = getHomeDashboardColors(colorScheme);
    const insets = useSafeAreaInsets();
    const [showCustomAllergenSearch, setShowCustomAllergenSearch] = React.useState(false);
    const customAllergenSectionYRef = React.useRef<number | null>(null);

    const {
        loading,
        savedNoticeKey,
        customAllergenInputValue,
        allergies,
        severityMap,
        customAllergenSuggestions,
        scrollViewRef,
        toggleAllergen,
        cycleSeverity,
        handleCustomAllergenInputChange,
        addCustomAllergen,
        selectCustomAllergenSuggestion,
        saveProfile,
    } = useProfileScreen();
    const savedToastOpacity = React.useRef(new Animated.Value(0)).current;
    const [isSavedToastVisible, setIsSavedToastVisible] = React.useState(false);

    const customAllergies = React.useMemo(
        () => allergies.filter((id) => !COMMON_ALLERGEN_ID_SET.has(id)),
        [allergies],
    );
    const ledgerItems = React.useMemo(
        () => buildLedgerItems(allergies),
        [allergies],
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
    React.useEffect((): (() => void) | undefined => {
        if (savedNoticeKey === 0) {
            return undefined;
        }

        setIsSavedToastVisible(true);
        savedToastOpacity.stopAnimation();
        savedToastOpacity.setValue(1);

        const animation = Animated.timing(savedToastOpacity, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: true,
        });

        animation.start(({ finished }) => {
            if (finished) {
                setIsSavedToastVisible(false);
            }
        });

        return () => {
            animation.stop();
        };
    }, [savedNoticeKey, savedToastOpacity]);

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
            <StatusBar style={isDarkTheme ? 'light' : 'dark'} />
            {isDarkTheme ? null : <HomeBackgroundAtmosphere />}
            <ProfileHeader
                theme={theme}
                onBack={handleBack}
                onSave={saveProfile}
                saving={loading}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                enabled={true}
                style={{ flex: 1 }}
            >
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.container}
                    contentContainerStyle={{
                        paddingBottom: insets.bottom + 40,
                    }}
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode="on-drag"
                >
                    <View
                        style={[
                            styles.summaryPanel,
                            {
                                backgroundColor: theme.surface,
                                borderColor: theme.border,
                                shadowColor: theme.shadow,
                            },
                        ]}
                    >
                        {isDarkTheme ? null : (
                            <PearlSurfaceOverlay
                                accentWashColor={homeDashboardColors.pearlMist}
                                baseBottomColor={homeDashboardColors.paperStrong}
                                baseTopColor={homeDashboardColors.pearlIvory}
                                coolWashColor={homeDashboardColors.pearlSage}
                                warmWashColor={homeDashboardColors.pearlPeach}
                            />
                        )}
                        <View style={styles.summaryPanelContent}>
                            <View style={styles.summaryPanelHeader}>
                                <Text style={[styles.summaryTitle, { color: theme.textPrimary }]}>
                                    {t('profile.health.summary.title', 'FoodLens safety criteria')}
                                </Text>
                                <Text style={[styles.summaryDescription, { color: theme.textSecondary }]}>
                                    {t(
                                        'profile.health.summary.subtitle',
                                        'Scans use these items to flag food that needs caution.',
                                    )}
                                </Text>
                            </View>

                            <View style={styles.summaryMetricRow}>
                                <View
                                    style={[
                                        styles.summaryMetricPill,
                                        { backgroundColor: theme.background, borderColor: theme.border },
                                    ]}
                                >
                                    <Text style={[styles.summaryMetricText, { color: theme.textSecondary }]}>
                                        {replaceCountTemplate(
                                            t('profile.health.allergiesTemplate', '{count} allergies'),
                                            allergies.length,
                                        )}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.summaryMetricPill,
                                        { backgroundColor: theme.background, borderColor: theme.border },
                                    ]}
                                >
                                    <Text style={[styles.summaryMetricText, { color: theme.textSecondary }]}>
                                        {replaceCountTemplate(
                                            t('profile.health.customTemplate', '{count} custom'),
                                            customAllergies.length,
                                        )}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.summaryMetricPill,
                                        { backgroundColor: theme.background, borderColor: theme.border },
                                    ]}
                                >
                                    <Text style={[styles.summaryMetricText, { color: theme.textSecondary }]}>
                                        {replaceCountTemplate(
                                            t('profile.health.severeTemplate', '{count} severe'),
                                            severeCount,
                                        )}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.editActionRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.editActionButton,
                                        {
                                            backgroundColor: theme.textPrimary,
                                            borderColor: theme.textPrimary,
                                        },
                                    ]}
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
                                    <Plus size={17} color={theme.background} />
                                    <Text style={[styles.editActionText, { color: theme.background }]}>
                                        {t('profile.health.addMissingAllergen', 'Add missing allergen')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <View style={styles.ledgerSection}>
                        <View style={styles.sectionTitleRow}>
                            <View>
                                <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>
                                    {t('profile.health.selected.title', 'Protection ledger')}
                                </Text>
                                <Text style={[styles.sectionSubtext, { color: theme.textSecondary }]}>
                                    {t('profile.health.selected.subtitle', 'Review selected items and their severity.')}
                                </Text>
                            </View>
                        </View>

                        {ledgerItems.length === 0 ? (
                            <View
                                style={[
                                    styles.emptyLedgerCard,
                                    { backgroundColor: theme.surface, borderColor: theme.border },
                                ]}
                            >
                                <ShieldCheck size={22} color={theme.textSecondary} />
                                <View style={styles.emptyLedgerTextGroup}>
                                    <Text style={[styles.emptyLedgerTitle, { color: theme.textPrimary }]}>
                                        {t('profile.health.empty.title', 'No items yet')}
                                    </Text>
                                    <Text style={[styles.emptyLedgerBody, { color: theme.textSecondary }]}>
                                        {t('profile.health.empty.body', 'Add allergens before scanning.')}
                                    </Text>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.ledgerList}>
                                {ledgerItems.map((item) => {
                                    const severity = severityMap[item.id] || 'moderate';
                                    const tone = getSeverityTone(severity, dashboardColors);
                                    const severityLabel = t(
                                        `profile.health.severity.${severity}`,
                                        getSeverityFallback(severity),
                                    );
                                    const itemName = resolveSeverityItemName(item.id, t);
                                    const handleRemove = (): void => {
                                        toggleAllergen(item.id);
                                    };

                                    return (
                                        <View
                                            key={`ledger-${item.id}`}
                                            style={[
                                                styles.ledgerRow,
                                                { backgroundColor: theme.surface, borderColor: theme.border },
                                            ]}
                                        >
                                            <TouchableOpacity
                                                style={styles.ledgerMainButton}
                                                onPress={() => cycleSeverity(item.id)}
                                                activeOpacity={0.72}
                                                accessibilityRole="button"
                                                accessibilityLabel={`${itemName}, ${t('profile.health.kind.allergen', 'Allergen')}, ${severityLabel}`}
                                                accessibilityHint={t(
                                                    'profile.health.severityHint',
                                                    'Changes severity level',
                                                )}
                                            >
                                                <View style={styles.ledgerItemTextGroup}>
                                                    <Text style={[styles.ledgerItemName, { color: theme.textPrimary }]}>
                                                        {itemName}
                                                    </Text>
                                                    <Text style={[styles.ledgerItemKind, { color: theme.textSecondary }]}>
                                                        {t('profile.health.kind.allergen', 'Allergen')}
                                                    </Text>
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
                                                style={[
                                                    styles.ledgerRemoveButton,
                                                    { borderLeftColor: theme.border },
                                                ]}
                                                onPress={handleRemove}
                                                accessibilityRole="button"
                                                accessibilityLabel={replaceItemTemplate(
                                                    t('profile.health.removeItemTemplate', 'Remove {item}'),
                                                    itemName,
                                                )}
                                            >
                                                <CircleX size={19} color={theme.textSecondary} />
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>

                    <View style={styles.editorSection}>
                        <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>
                            {t('profile.health.commonAllergens.title', 'Common allergens')}
                        </Text>
                        <AllergenGrid
                            dashboardColors={dashboardColors}
                            theme={theme}
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
                                style={[styles.searchToggleButton, { borderColor: theme.border }]}
                                onPress={handleShowCustomAllergenSearch}
                                accessibilityRole="button"
                                accessibilityLabel={t('onboarding.allergies.notFound', 'Not finding yours?')}
                                accessibilityHint={t(
                                    'onboarding.accessibility.searchAllergenHint',
                                    'Open search to add a custom allergen',
                                )}
                            >
                                <Plus size={17} color={theme.textPrimary} />
                                <Text style={[styles.searchToggleText, { color: theme.textPrimary }]}>
                                    {t('profile.health.customAllergen.title', 'Missing from the list')}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View>
                                <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>
                                    {t('profile.health.customAllergen.title', 'Missing from the list')}
                                </Text>
                                <Text style={[styles.sectionSubtext, { color: theme.textSecondary }]}>
                                    {t(
                                        'profile.health.customAllergen.subtitle',
                                        'Add an allergen FoodLens should treat as a safety risk.',
                                    )}
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
                </ScrollView>
            </KeyboardAvoidingView>

            {isSavedToastVisible ? (
                <Animated.View
                    pointerEvents="none"
                    style={[styles.savedToastOverlay, { opacity: savedToastOpacity }]}
                >
                    <View
                        accessibilityRole="alert"
                        style={[styles.savedToast, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    >
                        <View style={[styles.savedToastIcon, { backgroundColor: theme.background }]}>
                            <Check size={14} color={homeDashboardColors.accentGreen} />
                        </View>
                        <Text style={[styles.savedToastText, { color: theme.textPrimary }]}>
                            {t('profile.health.saved', 'Saved')}
                        </Text>
                    </View>
                </Animated.View>
            ) : null}
        </SafeAreaView>
    );
}
