import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Region } from 'react-native-maps';
import { LayoutAnimation } from 'react-native';
import { ArchiveMode } from '../types/history.types';
import { confirmBulkDelete } from '../utils/historyDialogs';
import { configureHistoryLayoutAnimation } from '../utils/historyLayoutAnimation';
import { toggleInSet } from '../utils/historySelection';
import { useI18n } from '@/features/i18n';

type UseHistoryScreenOptions = {
    deleteMultipleItems: (ids: Set<string>) => Promise<void>;
    initialArchiveMode: ArchiveMode;
    initialMapRegion: Region | null;
    isReduceMotionEnabled: boolean;
    onArchiveModeChange: (mode: ArchiveMode) => void;
};

export const useHistoryScreen = ({
    deleteMultipleItems,
    initialArchiveMode,
    initialMapRegion,
    isReduceMotionEnabled,
    onArchiveModeChange,
}: UseHistoryScreenOptions) => {
    const { t } = useI18n();
    const [archiveMode, setArchiveMode] = useState<ArchiveMode>(initialArchiveMode);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const savedMapRegionRef = useRef<Region | null>(initialMapRegion);
    const [savedMapRegion, setSavedMapRegionState] = useState<Region | null>(initialMapRegion);
    const archiveModePropRef = useRef<ArchiveMode>(initialArchiveMode);
    const initialMapRegionPropRef = useRef<Region | null>(initialMapRegion);
    const isMapModeAvailable = true;

    useEffect(() => {
        if (archiveModePropRef.current === initialArchiveMode) {
            return;
        }

        archiveModePropRef.current = initialArchiveMode;
        setArchiveMode(initialArchiveMode);
        setIsEditMode(false);
    }, [initialArchiveMode]);

    useEffect(() => {
        const currentRegion = initialMapRegionPropRef.current;
        const hasSameRegion =
            currentRegion?.latitude === initialMapRegion?.latitude &&
            currentRegion?.longitude === initialMapRegion?.longitude &&
            currentRegion?.latitudeDelta === initialMapRegion?.latitudeDelta &&
            currentRegion?.longitudeDelta === initialMapRegion?.longitudeDelta;

        if (hasSameRegion) {
            return;
        }

        initialMapRegionPropRef.current = initialMapRegion;
        savedMapRegionRef.current = initialMapRegion;
        setSavedMapRegionState(initialMapRegion);
    }, [initialMapRegion]);

    const handleSwitchMode = useCallback((mode: ArchiveMode) => {
        if (mode === 'map') setIsEditMode(false);
        configureHistoryLayoutAnimation(isReduceMotionEnabled, LayoutAnimation.Presets.spring);
        setArchiveMode(mode);
        onArchiveModeChange(mode);
    }, [isReduceMotionEnabled, onArchiveModeChange]);

    const toggleEditMode = useCallback(() => {
        setIsEditMode((prev) => !prev);
        setSelectedItems(new Set());
    }, []);

    const toggleSelectItem = useCallback((id: string) => {
        setSelectedItems((prev) => toggleInSet(prev, id));
    }, []);

    const replaceSelection = useCallback((ids: Set<string>) => {
        setSelectedItems(new Set(ids));
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
        savedMapRegion,
        setSavedMapRegion: setSavedMapRegionState,
        isMapModeAvailable,
        handleSwitchMode,
        toggleEditMode,
        replaceSelection,
        toggleSelectItem,
        handleBulkDelete,
    }), [
        archiveMode,
        isEditMode,
        selectedItems,
        savedMapRegionRef,
        savedMapRegion,
        setSavedMapRegionState,
        isMapModeAvailable,
        handleSwitchMode,
        toggleEditMode,
        replaceSelection,
        toggleSelectItem,
        handleBulkDelete,
    ]);
};
