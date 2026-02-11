import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { ShieldAlert, CheckCircle2 } from 'lucide-react-native';
import { ALLERGEN_TERMS } from '../../../services/staticTranslations';
import {
    ALLERGIES_EMPTY_DESCRIPTION,
    ALLERGIES_EMPTY_TITLE,
} from '../constants/allergies.constants';
import { translateAllergenToKorean } from '../utils/translateAllergen';
import { AllergiesTheme } from '../types/allergies.types';
import { allergiesStyles as styles } from '../styles/allergiesStyles';

type AllergyListSectionProps = {
    loading: boolean;
    allergies: string[];
    theme: AllergiesTheme;
};

export default function AllergyListSection({ loading, allergies, theme }: AllergyListSectionProps) {
    if (loading) {
        return <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />;
    }

    if (allergies.length === 0) {
        return (
            <View style={[styles.emptyState, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <CheckCircle2 size={48} color="#10B981" />
                <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{ALLERGIES_EMPTY_TITLE}</Text>
                <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
                    {ALLERGIES_EMPTY_DESCRIPTION}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.listContainer}>
            {allergies.map((item, index) => (
                <View
                    key={index}
                    style={[styles.allergyItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                    <View style={[styles.iconBox, { backgroundColor: theme.background }]}>
                        <ShieldAlert size={20} color="#E11D48" />
                    </View>
                    <View>
                        <Text style={[styles.allergyNameKr, { color: theme.textPrimary }]}>
                            {translateAllergenToKorean(item, ALLERGEN_TERMS)}
                        </Text>
                        <Text style={[styles.allergyNameEn, { color: theme.textSecondary }]}>{item}</Text>
                    </View>
                </View>
            ))}
        </View>
    );
}

