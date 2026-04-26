import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';
import { homeDashboardColors } from '@/features/home/components/homeDashboardTokens';

type SaveProfileFooterProps = {
    theme: ProfileTheme;
    loading: boolean;
    isDirty: boolean;
    onSave: () => void;
    t: (key: string, fallback?: string) => string;
};

export default function SaveProfileFooter({ theme, loading, isDirty, onSave, t }: SaveProfileFooterProps) {
    if (!isDirty && !loading) {
        return null;
    }

    return (
        <View style={styles.footer}>
            <Text style={styles.footerStatusText}>
                {loading
                    ? t('profile.health.saving', 'Saving')
                    : t('profile.health.unsaved', 'Unsaved changes')}
            </Text>
            <TouchableOpacity
                style={[styles.saveButton, { shadowColor: theme.shadow }]}
                onPress={onSave}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={t('profile.health.saveChanges', 'Save changes')}
            >
                {loading ? (
                    <ActivityIndicator color={homeDashboardColors.paper} />
                ) : (
                    <Text style={styles.saveButtonText}>
                        {t('profile.health.saveChanges', 'Save changes')}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
}
