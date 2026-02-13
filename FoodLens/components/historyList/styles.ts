import { StyleSheet } from 'react-native';

const EMPTY_STATE_TOP_MARGIN = 40;
const EMPTY_STATE_OPACITY = 0.5;

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

export const historyListViewStyles = StyleSheet.create({
  container: { flex: 1 },
  headerComponent: { marginBottom: 16 },
  countryHeaderContainer: { marginBottom: 12 },
  regionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 8,
  },
  itemWrapper: { marginBottom: 10 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  itemMainContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  emojiBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  itemName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  itemDate: { fontSize: 12, fontWeight: '500' },
  statusIconBox: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emptyRegionContainer: { padding: 16, alignItems: 'center' },
  loadingContainer: { alignItems: 'center', marginTop: EMPTY_STATE_TOP_MARGIN },
  loadingText: { marginTop: 16 },
  emptyContainer: {
    alignItems: 'center',
    marginTop: EMPTY_STATE_TOP_MARGIN,
    opacity: EMPTY_STATE_OPACITY,
  },
  emptyText: { marginTop: 16, fontSize: 16, fontWeight: '600' },
});
