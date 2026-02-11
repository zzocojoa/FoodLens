import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { cameraStyles as styles } from '../styles/cameraStyles';

type CameraPermissionGateProps = {
    onOpenSettings: () => void;
};

export default function CameraPermissionGate({ onOpenSettings }: CameraPermissionGateProps) {
    return (
        <View style={[styles.container, styles.permissionContainer]}>
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <TouchableOpacity onPress={onOpenSettings} style={styles.permissionButton}>
                <Text style={styles.permissionButtonText}>Open Settings</Text>
            </TouchableOpacity>
        </View>
    );
}

