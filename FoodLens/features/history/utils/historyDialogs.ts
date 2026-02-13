import { Alert } from 'react-native';

export const confirmBulkDelete = (count: number, onConfirm: () => void) => {
    Alert.alert('Delete Items', `Are you sure you want to delete ${count} items?`, [
        { text: 'Cancel', style: 'cancel' },
        {
            text: 'Delete',
            style: 'destructive',
            onPress: onConfirm,
        },
    ]);
};

