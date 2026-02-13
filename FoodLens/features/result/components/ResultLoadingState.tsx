import React from 'react';
import { Text, View } from 'react-native';
import { resultStyles as styles } from '../styles/resultStyles';

type ResultLoadingStateProps = {
    isRestoring: boolean;
    t: (key: string, fallback?: string) => string;
};

export default function ResultLoadingState({ isRestoring, t }: ResultLoadingStateProps) {
    return (
        <View style={styles.loadingContainer}>
            <Text style={{ color: '#64748B' }}>
                {isRestoring
                    ? t('result.loading.restoring', 'Restoring session...')
                    : t('common.loading', 'Loading...')}
            </Text>
        </View>
    );
}
