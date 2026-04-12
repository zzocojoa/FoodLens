import { StyleSheet } from 'react-native';

export const actionButtonsStyles = StyleSheet.create({
  bottomFloat: {
    position: 'absolute',
    bottom: 30,
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 50,
  },
  helperText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#64748B',
    marginBottom: 10,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
