import { useCallback, useRef, useState } from 'react';
import { LayoutAnimation } from 'react-native';
import { ArchiveMode } from '../types/history.types';
import { confirmBulkDelete } from '../utils/historyDialogs';
import { toggleInSet } from '../utils/historySelection';

type UseHistoryScreenOptions = {
    deleteMultipleItems: (ids: Set<string>) => Promise<void>;
};

export const useHistoryScreen = ({ deleteMultipleItems }: UseHistoryScreenOptions) => {
    const [archiveMode, setArchiveMode] = useState<ArchiveMode>('map');
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const savedMapRegionRef = useRef<any>(null);

    const handleSwitchMode = useCallback((mode: ArchiveMode) => {
        if (mode === 'map') setIsEditMode(false);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setArchiveMode(mode);
    }, []);

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
        });
    }, [deleteMultipleItems, selectedItems]);

    return {
        archiveMode,
        isEditMode,
        selectedItems,
        savedMapRegionRef,
        handleSwitchMode,
        toggleEditMode,
        toggleSelectItem,
        handleBulkDelete,
    };
};
