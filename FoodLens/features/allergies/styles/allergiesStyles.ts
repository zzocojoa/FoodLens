import { StyleSheet } from 'react-native';

export const allergiesStyles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
    },
    content: {
        paddingHorizontal: 24,
        paddingBottom: 40,
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
        lineHeight: 22,
        marginBottom: 20,
        textAlign: 'center',
    },
    listContainer: {
        marginBottom: 40,
    },
    sectionGroup: {
        gap: 12,
        marginBottom: 28,
    },
    sectionLabel: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    allergyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        gap: 16,
    },
    itemContent: {
        flex: 1,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    allergyNameKr: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
    },
    allergyNameEn: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
        textTransform: 'capitalize',
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
        borderRadius: 24,
        borderWidth: 1,
        marginBottom: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
        marginTop: 16,
        marginBottom: 4,
    },
    emptyDesc: {
        color: '#64748B',
        marginBottom: 20,
        textAlign: 'center',
    },
    severityBadge: {
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    severityBadgeText: {
        fontSize: 12,
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
});
