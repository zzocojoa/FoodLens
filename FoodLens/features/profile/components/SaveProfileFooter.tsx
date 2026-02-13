import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';

type SaveProfileFooterProps = {
    theme: ProfileTheme;
    loading: boolean;
    onSave: () => void;
    t: (key: string, fallback?: string) => string;
};

export default function SaveProfileFooter({ theme, loading, onSave, t }: SaveProfileFooterProps) {
    return (
        <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
            <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.textPrimary, shadowColor: theme.shadow }]}
                onPress={onSave}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color={theme.background} />
                ) : (
                    <Text style={[styles.saveButtonText, { color: theme.background }]}>
                        {t('profile.action.saveChanges', 'Save Changes')}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
}
