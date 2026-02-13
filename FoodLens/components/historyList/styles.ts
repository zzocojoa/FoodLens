import { StyleSheet } from 'react-native';
import {
  FLOATING_BAR_BOTTOM_PADDING,
  FLOATING_BAR_HEIGHT,
  FLOATING_DELETE_COLOR,
} from './constants';

export const historyListStyles = StyleSheet.create({
  filterContainer: {
    flexDirection: 'row',
    padding: 6,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 24,
    gap: 8,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 17,
  },
  filterChipActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  filterText: {
    fontSize: 11,
    fontWeight: '800',
  },
  filterTextActive: {},
  floatingBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: FLOATING_BAR_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: FLOATING_BAR_BOTTOM_PADDING,
    zIndex: 200,
  },
  floatingDeleteButton: {
    backgroundColor: FLOATING_DELETE_COLOR,
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingVertical: 14,
    shadowColor: FLOATING_DELETE_COLOR,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  floatingDeleteContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floatingDeleteText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
  },
});
