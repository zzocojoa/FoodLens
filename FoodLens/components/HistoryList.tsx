import React, { useMemo, useCallback } from 'react';
import { View, Text, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { List, CheckCircle, Circle, ShieldCheck, AlertCircle, AlertTriangle } from 'lucide-react-native';
import { Colors } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';
import HistoryFilterChips from '@/components/historyList/components/HistoryFilterChips';
import HistoryFloatingDeleteBar from '@/components/historyList/components/HistoryFloatingDeleteBar';
import { HistoryListProps } from '@/components/historyList/types';
import { flattenHistoryData, FlattenedHistoryItem } from '@/hooks/historyDataUtils';
import CountryCardHeader from '@/components/historyList/components/CountryCardHeader';
import { FoodThumbnail } from './FoodThumbnail';
import { HapticTouchableOpacity } from './HapticFeedback';
import { getStatusMeta } from '@/components/historyList/utils/historyListUtils';
import { useRouter } from 'expo-router';
import { dataStore } from '@/services/dataStore';

const BASE_BOTTOM_PADDING = 40;
const EDIT_MODE_BOTTOM_PADDING = 140;
const HORIZONTAL_PADDING = 24;
const EMPTY_STATE_TOP_MARGIN = 40;
const EMPTY_STATE_OPACITY = 0.5;

export default function HistoryList({
    data,
    loading,
    refreshing,
    onRefresh,
    filter,
    setFilter,
    matchesFilter,
    isAllowedItemType,
    expandedCountries,
    onToggleCountry,
    isEditMode,
    selectedItems,
    onToggleItem,
    onDelete,
    onBulkDelete
}: HistoryListProps) {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const hasSelection = isEditMode && selectedItems.size > 0;

    const flattenedData = useMemo(() => 
        flattenHistoryData(data, expandedCountries, filter, matchesFilter, isAllowedItemType),
        [data, expandedCountries, filter, matchesFilter, isAllowedItemType]
    );

    const handleItemPress = (item: any) => {
        if (isEditMode) {
            onToggleItem(item.id);
            return;
        }
        dataStore.setData(item.originalRecord, item.originalRecord.location, item.originalRecord.imageUri || '');
        router.push({
            pathname: '/result',
            params: {
                fromStore: 'true',
                isBarcode: item.originalRecord?.isBarcode ? 'true' : 'false',
            },
        });
    };

    const renderStatusIcon = (kind: 'ok' | 'avoid' | 'ask') => {
        if (kind === 'ok') return <ShieldCheck size={16} color="#22C55E" />;
        if (kind === 'avoid') return <AlertCircle size={16} color="#F43F5E" />;
        return <AlertTriangle size={16} color="#CA8A04" />;
    };

    const renderItem = useCallback(({ item }: { item: FlattenedHistoryItem }) => {
        switch (item.type) {
            case 'country-header':
                return (
                    <View style={styles.countryHeaderContainer}>
                        <CountryCardHeader
                            flag={item.country.flag}
                            countryName={item.country.country}
                            total={item.country.total}
                            isExpanded={expandedCountries.has(item.id)}
                            onToggle={() => onToggleCountry(item.id)}
                            colorScheme={colorScheme}
                        />
                    </View>
                );
            case 'region-header':
                return (
                    <Text style={[styles.regionTitle, { color: theme.primary }]}>
                        {item.name}
                    </Text>
                );
            case 'food-item': {
                const statusMeta = getStatusMeta(item.data.type);
                return (
                    <View style={styles.itemWrapper}>
                        <HapticTouchableOpacity
                            style={[styles.itemRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                            hapticType="light"
                            onPress={() => handleItemPress(item.data)}
                        >
                            <View style={styles.itemMainContent} pointerEvents="none">
                                {isEditMode && (
                                    <View style={{ marginRight: 8 }}>
                                        {selectedItems.has(item.id) ? (
                                            <CheckCircle size={22} color="#2563EB" fill="#EFF6FF" />
                                        ) : (
                                            <Circle size={22} color="#CBD5E1" />
                                        )}
                                    </View>
                                )}
                                <View style={[styles.emojiBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                    <FoodThumbnail
                                        uri={item.data.imageUri}
                                        emoji={item.data.emoji}
                                        style={{ width: '100%', height: '100%', borderRadius: 16, backgroundColor: 'transparent' }}
                                        imageStyle={{ borderRadius: 12 }}
                                        fallbackFontSize={20}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.itemName, { color: theme.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
                                        {item.data.name}
                                    </Text>
                                    <Text style={[styles.itemDate, { color: theme.textSecondary }]}>{item.data.date}</Text>
                                </View>
                            </View>
                            <View style={[styles.statusIconBox, statusMeta.containerStyle]} pointerEvents="none">
                                {renderStatusIcon(statusMeta.kind)}
                            </View>
                        </HapticTouchableOpacity>
                    </View>
                );
            }
            case 'empty-region':
                return (
                    <View style={styles.emptyRegionContainer}>
                        <Text style={{ color: '#94A3B8', fontSize: 12 }}>
                            No {item.filter.toUpperCase()} records in this trip.
                        </Text>
                    </View>
                );
            default:
                return null;
        }
    }, [expandedCountries, colorScheme, theme, isEditMode, selectedItems, onToggleCountry, onToggleItem]);

    const ListEmptyComponent = useMemo(() => {
        if (loading) {
            return (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={theme.textPrimary} />
                    <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Passport...</Text>
                </View>
            );
        }
        return (
            <View style={styles.emptyContainer}>
                <List size={48} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No records found</Text>
            </View>
        );
    }, [loading, theme]);

    const AnyFlashList = FlashList as any;

    return (
        <View style={styles.container}>
            <AnyFlashList
                data={flattenedData}
                renderItem={renderItem}
                keyExtractor={(item: any) => item.id}
                estimatedItemSize={100}
                ListHeaderComponent={<HistoryFilterChips filter={filter} setFilter={setFilter} />}
                ListHeaderComponentStyle={styles.headerComponent}
                contentContainerStyle={{
                    paddingHorizontal: HORIZONTAL_PADDING,
                    paddingBottom: hasSelection ? EDIT_MODE_BOTTOM_PADDING : BASE_BOTTOM_PADDING,
                }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={ListEmptyComponent}
                showsVerticalScrollIndicator={false}
                getItemType={(item: any) => item.type}
            />

            {isEditMode && selectedItems.size > 0 && (
                <HistoryFloatingDeleteBar
                    selectedCount={selectedItems.size}
                    onBulkDelete={() => onBulkDelete(selectedItems)}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerComponent: { marginBottom: 16 },
    countryHeaderContainer: { marginBottom: 12 },
    regionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 8 },
    itemWrapper: { marginBottom: 10 },
    itemRow: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: 12, 
        borderRadius: 20, 
        borderWidth: 1 
    },
    itemMainContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    emojiBox: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1 },
    itemName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
    itemDate: { fontSize: 12, fontWeight: '500' },
    statusIconBox: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    emptyRegionContainer: { padding: 16, alignItems: 'center' },
    loadingContainer: { alignItems: 'center', marginTop: EMPTY_STATE_TOP_MARGIN },
    loadingText: { marginTop: 16 },
    emptyContainer: { alignItems: 'center', marginTop: EMPTY_STATE_TOP_MARGIN, opacity: EMPTY_STATE_OPACITY },
    emptyText: { marginTop: 16, fontSize: 16, fontWeight: '600' },
});
