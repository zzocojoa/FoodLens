import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { cameraStyles as styles } from '../styles/cameraStyles';
import { useI18n } from '@/features/i18n';

type CameraPermissionGateProps = {
    onOpenSettings: () => void;
};

export default function CameraPermissionGate({ onOpenSettings }: CameraPermissionGateProps) {
    const { t } = useI18n();

    return (
        <View style={[styles.container, styles.permissionContainer]}>
            <Text style={styles.permissionTitle}>
                {t('scan.permission.cameraRequired', 'Camera Access Required')}
            </Text>
            <TouchableOpacity onPress={onOpenSettings} style={styles.permissionButton}>
                <Text style={styles.permissionButtonText}>
                    {t('scan.permission.openSettings', 'Open Settings')}
                </Text>
            </TouchableOpacity>
        </View>
    );
}
