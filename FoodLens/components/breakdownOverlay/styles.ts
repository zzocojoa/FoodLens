import { StyleSheet } from 'react-native';
import { SHEET_HEIGHT } from './constants';

import { Colors } from '../../constants/theme';

export function getBreakdownOverlayStyles(theme: any) {
  const activeTheme = theme || Colors.light;
  return StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        justifyContent: 'flex-end',
    },
    sheet: {
        height: SHEET_HEIGHT,
        backgroundColor: activeTheme.surface,
        borderTopLeftRadius: 48,
        borderTopRightRadius: 48,
        shadowColor: activeTheme.shadow,
        shadowOffset: { width: 0, height: -20 },
        shadowOpacity: 0.3,
        shadowRadius: 60,
        elevation: 30,
    },
    dragIndicatorContainer: {
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 12,
    },
    dragIndicator: {
        width: 48,
        height: 6,
        backgroundColor: activeTheme.border,
        borderRadius: 3,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 32,
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '900',
        color: activeTheme.textPrimary,
        textTransform: 'uppercase',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 9,
        fontWeight: '700',
        color: activeTheme.textSecondary,
        letterSpacing: 2,
        marginTop: 4,
        fontStyle: 'italic',
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: activeTheme.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        flex: 1,
        paddingHorizontal: 24,
    },
    allergenBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        marginBottom: 20,
    },
    allergenText: {
        color: '#F43F5E',
        fontWeight: '700',
        fontSize: 13,
    },
    nutritionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 24,
        backgroundColor: activeTheme.background,
        padding: 24,
        borderRadius: 40,
        marginBottom: 16,
    },
    ringContainer: {
        position: 'relative',
        width: 128,
        height: 128,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringSvg: {
        transform: [{ rotate: '-90deg' }],
    },
    ringCenter: {
        position: 'absolute',
        alignItems: 'center',
    },
    calorieValue: {
        fontSize: 28,
        fontWeight: '900',
        color: activeTheme.textPrimary,
    },
    calorieLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: activeTheme.textSecondary,
        letterSpacing: 2,
    },
    macroList: {
        flex: 1,
        gap: 12,
    },
    macroRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    macroLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    macroDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    macroName: {
        fontSize: 11,
        fontWeight: '800',
        color: activeTheme.textSecondary,
        letterSpacing: 0.5,
    },
    macroValue: {
        fontSize: 13,
        fontWeight: '800',
        color: activeTheme.textPrimary,
    },
    noNutritionCard: {
        backgroundColor: activeTheme.background,
        padding: 32,
        borderRadius: 24,
        alignItems: 'center',
        marginBottom: 16,
    },
    noNutritionText: {
        color: activeTheme.textSecondary,
        fontWeight: '600',
    },
    sourceCard: {
        alignItems: 'center',
        paddingVertical: 12,
        marginBottom: 24,
    },
    sourceLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: activeTheme.textSecondary,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    sourceValue: {
        fontSize: 12,
        fontWeight: '700',
        color: activeTheme.primary,
        marginTop: 2,
    },
    sourceServing: {
        fontSize: 10,
        color: activeTheme.textSecondary,
        marginTop: 2,
    },
    confidenceSection: {
        marginBottom: 32,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: activeTheme.textPrimary,
    },
    ingredientRow: {
        marginBottom: 16,
    },
    ingredientInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    ingredientName: {
        fontSize: 14,
        fontWeight: '700',
        color: activeTheme.textPrimary,
    },
    ingredientMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    ingredientCalories: {
        fontSize: 11,
        color: activeTheme.textSecondary,
        fontWeight: '600',
    },
    ingredientMacroRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 4,
    },
    ingredientMacroText: {
        fontSize: 10,
        color: activeTheme.textSecondary,
    },
    allergenTag: {
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    allergenTagText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#F43F5E',
        letterSpacing: 0.5,
    },
    confidenceBar: {
        height: 6,
        backgroundColor: activeTheme.border,
        borderRadius: 3,
        overflow: 'hidden',
    },
    confidenceFill: {
        height: '100%',
        borderRadius: 3,
    },
  });
}
