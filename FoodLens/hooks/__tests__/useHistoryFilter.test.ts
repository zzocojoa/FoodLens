import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useHistoryFilter } from '../useHistoryFilter';

describe('useHistoryFilter', () => {
  it('re-syncs filter state when initialFilter changes', async () => {
    const onFilterChange = jest.fn();
    const initialProps: {
      initialFilter?: 'all' | 'ok' | 'avoid' | 'ask';
    } = {
      initialFilter: 'all',
    };
    const { result, rerender } = renderHook(
      ({ initialFilter }: { initialFilter?: 'all' | 'ok' | 'avoid' | 'ask' }) =>
        useHistoryFilter({
          initialFilter,
          onFilterChange,
        }),
      {
        initialProps,
      }
    );

    act(() => {
      result.current.setArchiveFilter('ok');
    });

    expect(result.current.archiveFilter).toBe('ok');
    expect(onFilterChange).toHaveBeenCalledWith('ok');

    rerender({
      initialFilter: 'ask',
    });

    await waitFor(() => {
      expect(result.current.archiveFilter).toBe('ask');
    });
  });
});
