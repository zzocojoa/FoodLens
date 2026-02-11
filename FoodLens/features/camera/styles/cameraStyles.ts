import { StyleSheet } from 'react-native';

export const cameraStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
    },
    darkOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.8)',
    },
    permissionContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    permissionTitle: {
        textAlign: 'center',
        marginBottom: 20,
        fontSize: 18,
        color: 'white',
    },
    permissionButton: {
        backgroundColor: '#2563EB',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    permissionButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    launchingTextContainer: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    launchingText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        opacity: 0.8,
    },
});

