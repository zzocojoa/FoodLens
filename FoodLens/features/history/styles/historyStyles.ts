import { StyleSheet } from 'react-native';

export const historyStyles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 16,
        zIndex: 100,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    headerTitleContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
    },
    toggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 4,
        borderRadius: 20,
    },
    toggleButton: {
        padding: 6,
        borderRadius: 16,
    },
    verticalDivider: {
        width: 1,
        height: 16,
        marginHorizontal: 4,
    },
});

