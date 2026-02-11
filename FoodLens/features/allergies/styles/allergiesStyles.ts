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
    description: {
        fontSize: 14,
        color: '#64748B',
        lineHeight: 22,
        marginBottom: 32,
        textAlign: 'center',
    },
    listContainer: {
        gap: 12,
        marginBottom: 40,
    },
    allergyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        gap: 16,
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

