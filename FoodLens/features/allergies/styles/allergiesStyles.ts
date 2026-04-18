import { StyleSheet } from 'react-native';

export const allergiesStyles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 12,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.4,
        color: '#0F172A',
    },
    content: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    topfold: {
        borderWidth: 1,
        borderRadius: 28,
        paddingHorizontal: 20,
        paddingVertical: 18,
        marginBottom: 20,
        gap: 14,
    },
    passportHeroSection: {
        paddingHorizontal: 0,
        paddingTop: 0,
        paddingBottom: 4,
        marginBottom: 24,
        gap: 16,
    },
    passportHeroHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
    },
    passportHeroLead: {
        flex: 1,
        gap: 6,
    },
    passportHeroEyebrow: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    passportHeroTitle: {
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -0.8,
    },
    passportHeroDescription: {
        fontSize: 14,
        lineHeight: 21,
    },
    topfoldRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
    },
    summaryContent: {
        flex: 1,
        gap: 6,
    },
    summaryTitle: {
        fontSize: 26,
        fontWeight: '800',
        letterSpacing: -0.6,
    },
    summaryHint: {
        fontSize: 14,
        lineHeight: 21,
    },
    summaryChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    passportHeroFooter: {
        gap: 12,
    },
    summaryChip: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    summaryChipText: {
        fontSize: 12,
        fontWeight: '700',
    },
    inlineEditButton: {
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inlineEditButtonText: {
        fontSize: 13,
        fontWeight: '700',
    },
    primaryTravelerButton: {
        borderRadius: 18,
        paddingHorizontal: 18,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryTravelerButtonText: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    editButton: {
        borderRadius: 16,
        paddingHorizontal: 18,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    editButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    description: {
        fontSize: 14,
        color: '#64748B',
        lineHeight: 21,
        marginBottom: 20,
    },
    listContainer: {
        marginBottom: 40,
    },
    sectionGroup: {
        gap: 12,
        marginBottom: 28,
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    allergyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 18,
        borderRadius: 24,
        borderWidth: 1,
        gap: 14,
    },
    itemContent: {
        flex: 1,
        gap: 4,
    },
    itemMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    allergyNameKr: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1E293B',
    },
    allergyNameEn: {
        fontSize: 13,
        color: '#94A3B8',
        fontWeight: '500',
        textTransform: 'capitalize',
    },
    emptyState: {
        alignItems: 'flex-start',
        padding: 28,
        borderRadius: 24,
        borderWidth: 1,
        marginBottom: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 6,
    },
    emptyDesc: {
        color: '#64748B',
        marginBottom: 20,
        lineHeight: 21,
    },
    severityBadge: {
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    severityBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    sectionHeader: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    travelerUtilitySection: {
        borderWidth: 1,
        borderRadius: 28,
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 4,
    },
    travelerUtilityHeader: {
        marginBottom: 14,
        gap: 4,
    },
    travelerUtilityEyebrow: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    travelerUtilityDescription: {
        fontSize: 13,
        lineHeight: 19,
    },
    loadingRow: {
        marginBottom: 12,
    },
    loadingContent: {
        flex: 1,
        gap: 10,
    },
    skeletonIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
    },
    skeletonLinePrimary: {
        width: '52%',
        height: 18,
        borderRadius: 999,
    },
    skeletonLineSecondary: {
        width: '34%',
        height: 12,
        borderRadius: 999,
    },
    skeletonBadge: {
        width: 74,
        height: 30,
        borderRadius: 999,
    },
    travelerModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.86)',
    },
    travelerModalSafeArea: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingBottom: 24,
    },
    travelerModalHeader: {
        alignItems: 'flex-end',
        marginBottom: 12,
    },
    travelerModalCloseButton: {
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.14)',
    },
    travelerModalCloseText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    travelerModalCardFrame: {
        justifyContent: 'center',
    },
});
