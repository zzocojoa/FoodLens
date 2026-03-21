import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Region } from 'react-native-maps';
import { useHistoryScreen } from '../useHistoryScreen';

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('../../utils/historyDialogs', () => ({
  confirmBulkDelete: jest.fn(),
}));

describe('useHistoryScreen', () => {
  it('re-syncs archive mode and map region when synced props change', async () => {
    const nextRegion: Region = {
      latitude: 37.5665,
      longitude: 126.978,
      latitudeDelta: 0.2,
      longitudeDelta: 0.2,
    };
    const initialProps: {
      initialArchiveMode: 'list' | 'map';
      initialMapRegion: Region | null;
    } = {
      initialArchiveMode: 'list',
      initialMapRegion: null,
    };

    const { result, rerender } = renderHook(
      ({
        initialArchiveMode,
        initialMapRegion,
      }: {
        initialArchiveMode: 'list' | 'map';
        initialMapRegion: Region | null;
      }) =>
        useHistoryScreen({
          deleteMultipleItems: async () => undefined,
          initialArchiveMode,
          initialMapRegion,
          onArchiveModeChange: jest.fn(),
        }),
      {
        initialProps,
      }
    );

    expect(result.current.archiveMode).toBe('list');
    expect(result.current.savedMapRegionRef.current).toBeNull();

    rerender({
      initialArchiveMode: 'map',
      initialMapRegion: nextRegion,
    });

    await waitFor(() => {
      expect(result.current.archiveMode).toBe('map');
      expect(result.current.savedMapRegion).toEqual(nextRegion);
      expect(result.current.savedMapRegionRef.current).toEqual(nextRegion);
    });
  });

  it('keeps local mode change and notifies caller', () => {
    const onArchiveModeChange = jest.fn();
    const { result } = renderHook(() =>
      useHistoryScreen({
        deleteMultipleItems: async () => undefined,
        initialArchiveMode: 'list',
        initialMapRegion: null,
        onArchiveModeChange,
      })
    );

    act(() => {
      result.current.handleSwitchMode('map');
    });

    expect(result.current.archiveMode).toBe('map');
    expect(onArchiveModeChange).toHaveBeenCalledWith('map');
  });

  it('keeps selected items in local screen state only', () => {
    const onArchiveModeChange = jest.fn();
    const { result } = renderHook(() =>
      useHistoryScreen({
        deleteMultipleItems: async () => undefined,
        initialArchiveMode: 'list',
        initialMapRegion: null,
        onArchiveModeChange,
      })
    );

    act(() => {
      result.current.toggleEditMode();
      result.current.toggleSelectItem('item_a');
      result.current.toggleSelectItem('item_b');
    });

    expect(result.current.isEditMode).toBe(true);
    expect(Array.from(result.current.selectedItems)).toEqual(['item_a', 'item_b']);
    expect(onArchiveModeChange).not.toHaveBeenCalled();

    act(() => {
      result.current.replaceSelection(new Set(['item_c']));
    });

    expect(Array.from(result.current.selectedItems)).toEqual(['item_c']);
    expect(onArchiveModeChange).not.toHaveBeenCalled();
  });
});
