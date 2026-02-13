import React from 'react';
import { Text, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { useAllergyAlertCardModel } from '../hooks/useAllergyAlertCardModel';

type AllergyAlertCardProps = {
    colorScheme: 'light' | 'dark';
};

export default function AllergyAlertCard({ colorScheme }: AllergyAlertCardProps) {
    const { colors } = useAllergyAlertCardModel(colorScheme);

    return (
        <View
            style={[
                styles.allergyCard,
                colors.container,
            ]}
        >
            <View style={styles.allergyIconBox}>
                <AlertCircle size={28} color="white" />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.allergyTitle, colors.titleColor && { color: colors.titleColor }]}>Allergy Alert</Text>
                <Text style={[styles.allergyDesc, colors.descColor && { color: colors.descColor }]}>
                    Contains ingredients that match your allergy profile. Please exercise caution.
                </Text>
            </View>
        </View>
    );
}
