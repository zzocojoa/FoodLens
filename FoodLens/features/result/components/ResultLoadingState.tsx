import React from 'react';
import { Text, View } from 'react-native';
import { resultStyles as styles } from '../styles/resultStyles';

type ResultLoadingStateProps = {
    isRestoring: boolean;
};

export default function ResultLoadingState({ isRestoring }: ResultLoadingStateProps) {
    return (
        <View style={styles.loadingContainer}>
            <Text style={{ color: '#64748B' }}>{isRestoring ? 'Restoring session...' : 'Loading...'}</Text>
        </View>
    );
}
