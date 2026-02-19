import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';

type SaveProfileFooterProps = {
    theme: ProfileTheme;
    loading: boolean;
    logoutLoading: boolean;
    onSave: () => void;
    onLogout: () => void;
    t: (key: string, fallback?: string) => string;
};

export default function SaveProfileFooter({ theme, loading, logoutLoading, onSave, onLogout, t }: SaveProfileFooterProps) {
    return (
        <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
            <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.textPrimary, shadowColor: theme.shadow }]}
                onPress={onSave}
                disabled={loading || logoutLoading}
            >
                {loading ? (
                    <ActivityIndicator color={theme.background} />
                ) : (
                    <Text style={[styles.saveButtonText, { color: theme.background }]}>
                        {t('profile.action.saveChanges', 'Save Changes')}
                    </Text>
                )}
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.logoutButton, { borderColor: theme.border }]}
                onPress={onLogout}
                disabled={loading || logoutLoading}
            >
                {logoutLoading ? (
                    <ActivityIndicator color={theme.textPrimary} />
                ) : (
                    <Text style={[styles.logoutButtonText, { color: theme.textPrimary }]}>
                        {t('profile.action.logout', 'Log out')}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
}
