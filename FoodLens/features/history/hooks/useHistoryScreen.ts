import { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Platform } from 'react-native';
import { ArchiveMode } from '../types/history.types';
import { confirmBulkDelete } from '../utils/historyDialogs';
import { toggleInSet } from '../utils/historySelection';
import { useI18n } from '@/features/i18n';
import { showTranslatedAlert } from '@/services/ui/uiAlerts_Logic';

type UseHistoryScreenOptions = {
    deleteMultipleItems: (ids: Set<string>) => Promise<void>;
};

export const useHistoryScreen = ({ deleteMultipleItems }: UseHistoryScreenOptions) => {
    const { t } = useI18n();
    const [archiveMode, setArchiveMode] = useState<ArchiveMode>('list');
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const savedMapRegionRef = useRef<any>(null);
    const hasAndroidGoogleMapsApiKey = (process.env['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'] ?? '').trim().length > 0;
    const isMapModeAvailable = Platform.OS !== 'android' || hasAndroidGoogleMapsApiKey;

    const handleSwitchMode = useCallback((mode: ArchiveMode) => {
        if (mode === 'map' && !isMapModeAvailable) {
            showTranslatedAlert(t, {
                titleKey: 'history.map.unavailableTitle',
                titleFallback: 'Map unavailable',
                messageKey: 'history.map.unavailableMessage',
                messageFallback: 'Map view is unavailable on this build. Configure EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild Android.',
            });
            return;
        }
        if (mode === 'map') setIsEditMode(false);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setArchiveMode(mode);
    }, [isMapModeAvailable, t]);

    const toggleEditMode = useCallback(() => {
        setIsEditMode((prev) => !prev);
        setSelectedItems(new Set());
    }, []);

    const toggleSelectItem = useCallback((id: string) => {
        setSelectedItems((prev) => toggleInSet(prev, id));
    }, []);

    const handleBulkDelete = useCallback(() => {
        if (selectedItems.size === 0) return;

        confirmBulkDelete(selectedItems.size, async () => {
            await deleteMultipleItems(selectedItems);
            setIsEditMode(false);
        }, t);
    }, [deleteMultipleItems, selectedItems, t]);

    return useMemo(() => ({
        archiveMode,
        isEditMode,
        selectedItems,
        savedMapRegionRef,
        isMapModeAvailable,
        handleSwitchMode,
        toggleEditMode,
        toggleSelectItem,
        handleBulkDelete,
    }), [
        archiveMode,
        isEditMode,
        selectedItems,
        savedMapRegionRef,
        isMapModeAvailable,
        handleSwitchMode,
        toggleEditMode,
        toggleSelectItem,
        handleBulkDelete,
    ]);
};
