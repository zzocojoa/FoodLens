import React from 'react';
import { Animated, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { AlertCircle, AlertTriangle, CheckCircle, Circle, ShieldCheck, Trash2 } from 'lucide-react-native';
import { dataStore } from '@/services/dataStore';
import { FoodThumbnail } from '@/components/FoodThumbnail';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { Colors } from '@/constants/theme';
import { CountryData } from '@/models/History';
import { countryCardStyles as styles } from '../styles';
import { CountryListItem } from '../types';
import { getStatusMeta } from '../utils/countryCardUtils';

type CountryRegionListProps = {
    country: CountryData;
    filter: string;
    matchesFilter: (type: string | undefined) => boolean;
    isAllowedItemType: (type: string | undefined) => boolean;
    isEditMode: boolean;
    selectedItems: Set<string>;
    onToggleItem: (id: string) => void;
    onDelete: (id: string) => void;
    setSwipeableRef: (id: string, ref: any | null) => void;
    colorScheme: keyof typeof Colors;
};

const renderStatusIcon = (kind: 'ok' | 'avoid' | 'ask') => {
    if (kind === 'ok') return <ShieldCheck size={16} color="#22C55E" />;
    if (kind === 'avoid') return <AlertCircle size={16} color="#F43F5E" />;
    return <AlertTriangle size={16} color="#CA8A04" />;
};

export default function CountryRegionList({
    country,
    filter,
    matchesFilter,
    isAllowedItemType,
    isEditMode,
    selectedItems,
    onToggleItem,
    onDelete,
    setSwipeableRef,
    colorScheme,
}: CountryRegionListProps) {
    const router = useRouter();
    const theme = Colors[colorScheme];

    const handleItemPress = (item: CountryListItem) => {
        if (isEditMode) {
            onToggleItem(item.id);
            return;
        }

        dataStore.setData(item.originalRecord, item.originalRecord.location, item.originalRecord.imageUri || '');
        router.push({ pathname: '/result', params: { fromStore: 'true' } });
    };

    const renderRightActions = (dragX: any, onClick: () => void) => {
        const trans = dragX.interpolate({
            inputRange: [-100, 0],
            outputRange: [0, 50],
            extrapolate: 'clamp',
        });

        return (
            <HapticTouchableOpacity onPress={onClick} style={styles.deleteAction} hapticType="warning">
                <Animated.View style={[styles.deleteBtnContent, { transform: [{ translateX: trans }] }]} pointerEvents="none">
                    <Trash2 size={24} color="white" />
                    <Text style={styles.deleteText}>Delete</Text>
                </Animated.View>
            </HapticTouchableOpacity>
        );
    };

    return (
        <View style={styles.accordionBody}>
            {(country.regions || []).map((region, rIdx) => {
                const visibleItems = (region.items || []).filter(
                    (item) => isAllowedItemType(item.type) && matchesFilter(item.type)
                );

                return (
                    <View key={rIdx} style={{ marginBottom: 16 }}>
                        {visibleItems.length > 0 && (
                            <Text style={[styles.regionTitle, { color: theme.primary }]}>{region.name}</Text>
                        )}

                        {visibleItems.map((item, itemIdx) => {
                            const statusMeta = getStatusMeta(item.type);
                            return (
                                <View style={{ marginBottom: 10 }} key={`${country.country}-${region.name ?? rIdx}-${item.id}-${itemIdx}`}>
                                    <Swipeable
                                        ref={(ref) => setSwipeableRef(item.id, ref)}
                                        renderRightActions={(_, dragX) => renderRightActions(dragX, () => onDelete(item.id))}
                                        enabled={!isEditMode}
                                    >
                                        <HapticTouchableOpacity
                                            style={[styles.itemRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                            hapticType="light"
                                            onPress={() => handleItemPress(item as CountryListItem)}
                                        >
                                            <View style={styles.itemMainContent} pointerEvents="none">
                                                {isEditMode && (
                                                    <View style={{ marginRight: 4 }}>
                                                        {selectedItems.has(item.id) ? (
                                                            <CheckCircle size={22} color="#2563EB" fill="#EFF6FF" />
                                                        ) : (
                                                            <Circle size={22} color="#CBD5E1" />
                                                        )}
                                                    </View>
                                                )}
                                                <View style={[styles.emojiBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                                    <FoodThumbnail
                                                        uri={(item as CountryListItem).imageUri}
                                                        emoji={item.emoji}
                                                        style={{ width: '100%', height: '100%', borderRadius: 16, backgroundColor: 'transparent' }}
                                                        imageStyle={{ borderRadius: 12 }}
                                                        fallbackFontSize={20}
                                                    />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.itemName, { color: theme.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
                                                        {item.name}
                                                    </Text>
                                                    <Text style={[styles.itemDate, { color: theme.textSecondary }]}>{item.date}</Text>
                                                </View>
                                            </View>
                                            <View style={[styles.statusIconBox, statusMeta.containerStyle]} pointerEvents="none">
                                                {renderStatusIcon(statusMeta.kind)}
                                            </View>
                                        </HapticTouchableOpacity>
                                    </Swipeable>
                                </View>
                            );
                        })}
                    </View>
                );
            })}

            {country.regions.every(
                (region) =>
                    (region.items || []).filter((item) => isAllowedItemType(item.type) && matchesFilter(item.type)).length ===
                    0
            ) && (
                <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: '#94A3B8', fontSize: 12 }}>No {filter.toUpperCase()} records in this trip.</Text>
                </View>
            )}
        </View>
    );
}
