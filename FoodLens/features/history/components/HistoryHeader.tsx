import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronLeft, Globe, List } from 'lucide-react-native';
import { ArchiveMode } from '../types/history.types';
import { historyStyles as styles } from '../styles/historyStyles';
import { useI18n } from '@/features/i18n';

type HistoryHeaderProps = {
    title: string;
    theme: any;
    archiveMode: ArchiveMode;
    isEditMode: boolean;
    onBack: () => void;
    onSwitchMode: (mode: ArchiveMode) => void;
    onToggleEdit: () => void;
};

export default function HistoryHeader({
    title,
    theme,
    archiveMode,
    isEditMode,
    onBack,
    onSwitchMode,
    onToggleEdit,
}: HistoryHeaderProps) {
    const { t } = useI18n();

    return (
        <View style={styles.header}>
            <TouchableOpacity
                onPress={onBack}
                style={[styles.backButton, { backgroundColor: theme.glass, borderColor: theme.border }]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
                <View pointerEvents="none">
                    <ChevronLeft size={24} color={theme.textPrimary} />
                </View>
            </TouchableOpacity>

            <View style={styles.headerTitleContainer}>
                <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>{title}</Text>
            </View>

            <View style={[styles.toggleContainer, { backgroundColor: theme.surface }]}>
                {archiveMode === 'list' && (
                    <>
                        <TouchableOpacity
                            onPress={onToggleEdit}
                            style={[
                                styles.toggleButton,
                                isEditMode && { backgroundColor: theme.textPrimary, shadowColor: theme.shadow },
                            ]}
                        >
                            <View pointerEvents="none">
                                <Text
                                    style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: isEditMode ? theme.background : theme.textSecondary,
                                        paddingHorizontal: 4,
                                    }}
                                >
                                    {isEditMode
                                        ? t('history.header.done', 'Done')
                                        : t('history.header.edit', 'Edit')}
                                </Text>
                            </View>
                        </TouchableOpacity>
                        <View style={[styles.verticalDivider, { backgroundColor: theme.border }]} />
                    </>
                )}
                <TouchableOpacity
                    onPress={() => onSwitchMode('map')}
                    style={[
                        styles.toggleButton,
                        archiveMode === 'map' && { backgroundColor: theme.textPrimary, shadowColor: theme.shadow },
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                    <View pointerEvents="none">
                        <Globe size={18} color={archiveMode === 'map' ? theme.background : theme.textSecondary} />
                    </View>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => onSwitchMode('list')}
                    style={[
                        styles.toggleButton,
                        archiveMode === 'list' && { backgroundColor: theme.textPrimary, shadowColor: theme.shadow },
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                    <View pointerEvents="none">
                        <List size={18} color={archiveMode === 'list' ? theme.background : theme.textSecondary} />
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    );
}
