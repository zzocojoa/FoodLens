import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';
import { useI18n } from '@/features/i18n';
import { homeDashboardColors } from '@/features/home/components/homeDashboardTokens';

type ProfileHeaderProps = {
    theme: ProfileTheme;
    onBack: () => void;
    title?: string;
    onSave?: () => void;
    saving?: boolean;
};

export default function ProfileHeader({ theme, onBack, title, onSave, saving }: ProfileHeaderProps) {
    const { t } = useI18n();
    const resolvedTitle = title ?? t('profile.header.title', 'Health Profile');

    return (
        <View style={styles.navBar}>
            <TouchableOpacity
                onPress={onBack}
                style={styles.navButton}
                accessibilityRole="button"
                accessibilityLabel={t('common.back', 'Back')}
            >
                <ChevronLeft size={28} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.navTitle, { color: theme.textPrimary }]}>
                {resolvedTitle}
            </Text>
            <View style={styles.navRightSlot}>
                {onSave ? (
                    <TouchableOpacity
                        style={styles.headerSaveButton}
                        onPress={onSave}
                        disabled={saving === true}
                        accessibilityRole="button"
                        accessibilityLabel={t('profile.health.save', 'Save')}
                    >
                        {saving === true ? (
                            <ActivityIndicator color={homeDashboardColors.paper} size="small" />
                        ) : (
                            <Text style={styles.headerSaveButtonText}>
                                {t('profile.health.save', 'Save')}
                            </Text>
                        )}
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );
}
