import React from 'react';
import { Text, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';

type AllergyAlertCardProps = {
    colorScheme: 'light' | 'dark';
};

export default function AllergyAlertCard({ colorScheme }: AllergyAlertCardProps) {
    return (
        <View
            style={[
                styles.allergyCard,
                colorScheme === 'dark' && {
                    backgroundColor: 'rgba(225, 29, 72, 0.15)',
                    borderColor: 'rgba(225, 29, 72, 0.3)',
                },
            ]}
        >
            <View style={styles.allergyIconBox}>
                <AlertCircle size={28} color="white" />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.allergyTitle, colorScheme === 'dark' && { color: '#FDA4AF' }]}>Allergy Alert</Text>
                <Text style={[styles.allergyDesc, colorScheme === 'dark' && { color: '#FECDD3' }]}>
                    Contains ingredients that match your allergy profile. Please exercise caution.
                </Text>
            </View>
        </View>
    );
}
