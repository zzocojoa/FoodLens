import { Alert } from 'react-native';

export const confirmBulkDelete = (
    count: number,
    onConfirm: () => void,
    t: (key: string, fallback?: string) => string
) => {
    Alert.alert(
        t('history.alert.deleteItemsTitle', 'Delete Items'),
        t('history.alert.deleteItemsMessageTemplate', 'Are you sure you want to delete {count} items?').replace(
            '{count}',
            String(count)
        ),
        [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
            text: t('common.delete', 'Delete'),
            style: 'destructive',
            onPress: onConfirm,
        },
        ]
    );
};
