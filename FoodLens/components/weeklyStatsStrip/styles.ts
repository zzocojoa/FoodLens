import { StyleSheet } from 'react-native';
import { DAY_ITEM_HEIGHT, DAY_ITEM_WIDTH, STRIP_CONTAINER_HEIGHT } from './constants';

export const weeklyStatsStripStyles = StyleSheet.create({
  container: {
    marginBottom: 6,
    height: STRIP_CONTAINER_HEIGHT,
    marginTop: 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 8,
    alignItems: 'center',
  },
  dayItem: {
    width: DAY_ITEM_WIDTH,
    height: DAY_ITEM_HEIGHT,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
  },
  selectedItem: {
    borderWidth: 0,
  },
  unselectedItem: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  dateNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  todayIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3B82F6',
  },
});
