import { StyleSheet } from 'react-native';

export const historyListStyles = StyleSheet.create({
  filterContainer: {
    flexDirection: 'row',
    padding: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
    gap: 4,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  filterChipActive: {
    backgroundColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    fontWeight: '700',
  },
  floatingBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  floatingDeleteButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  floatingDeleteContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  floatingDeleteText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
});
