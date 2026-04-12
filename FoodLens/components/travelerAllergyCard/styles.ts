import { StyleSheet } from 'react-native';

export const travelerAllergyCardStyles = StyleSheet.create({
  container: {
    marginBottom: 28,
    paddingHorizontal: 0,
  },
  cardShell: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E4EBF5',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 22,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4C6EA8',
  },
  card: {
    backgroundColor: '#F5F9FF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: '#BFD6FF',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  mainText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3557A1',
    lineHeight: 30,
  },
});
