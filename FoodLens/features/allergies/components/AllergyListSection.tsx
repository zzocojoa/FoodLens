import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { ShieldAlert, CheckCircle2 } from 'lucide-react-native';
import { ALLERGEN_TERMS } from '../../../services/staticTranslations';
import { ALLERGIES_COPY } from '../constants/allergies.constants';
import { translateAllergenToKorean } from '../utils/translateAllergen';
import { AllergiesTheme } from '../types/allergies.types';
import { allergiesStyles as styles } from '../styles/allergiesStyles';
import { useI18n } from '@/features/i18n';
import { AllergySeverity } from '@/features/profile/types/profile.types';
import {
    getRestrictionDefaultLabel,
    resolveRestrictionDisplayName,
} from '@/features/profile/utils/profileSuggestions';

type AllergyListSectionProps = {
    loading: boolean;
    allergies: string[];
    dietaryRestrictions: string[];
    severityMap: Record<string, AllergySeverity>;
    theme: AllergiesTheme;
    onPressEdit: () => void;
};

const renderDisplayName = (
    item: string,
    t: (key: string, fallback: string) => string,
): string => {
    const ingredientLabel = resolveRestrictionDisplayName(item, t);
    const defaultLabel = getRestrictionDefaultLabel(item);
    if (ingredientLabel !== item) return ingredientLabel;
    if (defaultLabel !== item) return t(`profile.allergen.${item}`, defaultLabel);

    const staticLabel = translateAllergenToKorean(item, ALLERGEN_TERMS);
    if (staticLabel !== item) return staticLabel;
    return t(`profile.allergen.${item}`, defaultLabel);
};

const renderSecondaryName = (item: string): string => getRestrictionDefaultLabel(item);

const getSeverityTone = (
    severity: AllergySeverity,
    theme: AllergiesTheme,
    t: (key: string, fallback?: string) => string,
): { label: string; backgroundColor: string; borderColor: string; textColor: string } => {
    if (severity === 'mild') {
        return {
            label: t('onboarding.severity.mild', 'Mild'),
            backgroundColor: '#FEF3C7',
            borderColor: '#F59E0B',
            textColor: '#B45309',
        };
    }

    if (severity === 'severe') {
        return {
            label: t('onboarding.severity.severe', 'Severe'),
            backgroundColor: theme.background === '#020617' ? 'rgba(239, 68, 68, 0.18)' : '#FEF2F2',
            borderColor: '#EF4444',
            textColor: theme.background === '#020617' ? '#FCA5A5' : '#B91C1C',
        };
    }

    return {
        label: t('onboarding.severity.moderate', 'Moderate'),
        backgroundColor: theme.background === '#020617' ? 'rgba(249, 115, 22, 0.18)' : '#FFF7ED',
        borderColor: '#F97316',
        textColor: theme.background === '#020617' ? '#FDBA74' : '#C2410C',
    };
};

export default function AllergyListSection({
    loading,
    allergies,
    dietaryRestrictions,
    severityMap,
    theme,
    onPressEdit,
}: AllergyListSectionProps) {
    const { t } = useI18n();

    if (loading) {
        return <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />;
    }

    if (allergies.length === 0 && dietaryRestrictions.length === 0) {
        return (
            <View style={[styles.emptyState, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <CheckCircle2 size={48} color="#10B981" />
                <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                    {t(ALLERGIES_COPY.emptyTitle.key, ALLERGIES_COPY.emptyTitle.fallback)}
                </Text>
                <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
                    {t(ALLERGIES_COPY.emptyDescription.key, ALLERGIES_COPY.emptyDescription.fallback)}
                </Text>
                <TouchableOpacity
                    style={[styles.editButton, { backgroundColor: theme.primary }]}
                    onPress={onPressEdit}
                    activeOpacity={0.85}
                >
                    <Text style={styles.editButtonText}>
                        {t('allergies.empty.action', 'Add allergy info')}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.listContainer}>
            {allergies.length > 0 && (
                <View style={styles.sectionGroup}>
                    <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>
                        {t('allergies.section.savedAllergies', 'Allergies')}
                    </Text>
                    {allergies.map((item) => {
                        const severity = severityMap[item] ?? 'moderate';
                        const tone = getSeverityTone(severity, theme, t);

                        return (
                            <View
                                key={`allergy-${item}`}
                                style={[styles.allergyItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                            >
                                <View style={[styles.iconBox, { backgroundColor: theme.background }]}>
                                    <ShieldAlert size={20} color="#E11D48" />
                                </View>
                                <View style={styles.itemContent}>
                                    <Text style={[styles.allergyNameKr, { color: theme.textPrimary }]}>
                                        {renderDisplayName(item, t)}
                                    </Text>
                                    <Text style={[styles.allergyNameEn, { color: theme.textSecondary }]}>
                                        {renderSecondaryName(item)}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.severityBadge,
                                        {
                                            backgroundColor: tone.backgroundColor,
                                            borderColor: tone.borderColor,
                                        },
                                    ]}
                                >
                                    <Text style={[styles.severityBadgeText, { color: tone.textColor }]}>
                                        {tone.label}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            )}

            {dietaryRestrictions.length > 0 && (
                <View style={styles.sectionGroup}>
                    <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>
                        {t('allergies.section.otherRestrictions', 'Other Restrictions')}
                    </Text>
                    {dietaryRestrictions.map((item) => (
                        <View
                            key={`restriction-${item}`}
                            style={[styles.allergyItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                        >
                            <View style={[styles.iconBox, { backgroundColor: theme.background }]}>
                                <ShieldAlert size={20} color="#2563EB" />
                            </View>
                            <View style={styles.itemContent}>
                                <Text style={[styles.allergyNameKr, { color: theme.textPrimary }]}>
                                    {renderDisplayName(item, t)}
                                </Text>
                                <Text style={[styles.allergyNameEn, { color: theme.textSecondary }]}>
                                    {renderSecondaryName(item)}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}
