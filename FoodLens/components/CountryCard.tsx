import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Alert, Animated } from 'react-native'; // Animated imported
import { HapticTouchableOpacity } from './HapticFeedback';
import { BlurView } from 'expo-blur';
import { ChevronDown, List, ShieldCheck, AlertCircle, AlertTriangle, Trash2, Circle, CheckCircle } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { CountryData } from '../models/History';
import { THEME } from '../constants/theme';
import { dataStore } from '../services/dataStore';
import { FoodThumbnail } from './FoodThumbnail'; // NEW
import { Colors } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';

interface CountryCardProps {
    country: CountryData;
    countryIdx: number;
    isExpanded: boolean;
    onToggle: () => void;
    filter: string;
    matchesFilter: (type: string | undefined) => boolean;
    isAllowedItemType: (type: string | undefined) => boolean;
    isEditMode: boolean;
    selectedItems: Set<string>;
    onToggleItem: (id: string) => void;
    onDelete: (id: string) => void;
}

export default function CountryCard({
    country,
    countryIdx,
    isExpanded,
    onToggle,
    filter,
    matchesFilter,
    isAllowedItemType,
    isEditMode,
    selectedItems,
    onToggleItem,
    onDelete
}: CountryCardProps) {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const swipeableRefs = useRef<Map<string, any>>(new Map());

    // Reset swipe state when entering edit mode
    useEffect(() => {
        if (isEditMode) {
            swipeableRefs.current.forEach((ref) => {
                if (ref) ref.close();
            });
        }
    }, [isEditMode]);

    const getFilteredItemsCount = (country: CountryData) => {
        let count = 0;
        (country.regions || []).forEach(r => {
             const items = r.items || [];
             if (filter === 'all') {
                 count += items.filter(i => isAllowedItemType(i.type)).length;
             } else {
                 count += items.filter(i => matchesFilter(i.type)).length;
             }
        });
        return count;
    };

    const renderRightActions = (progress: any, dragX: any, onClick: () => void) => {
        const trans = dragX.interpolate({
            inputRange: [-100, 0],
            outputRange: [0, 50],
            extrapolate: 'clamp',
        });
        return (
            <HapticTouchableOpacity onPress={onClick} style={styles.deleteAction} hapticType="warning">
                <Animated.View 
                    style={[styles.deleteBtnContent, { transform: [{ translateX: trans }] }]}
                    pointerEvents="none"
                >
                    <Trash2 size={24} color="white" />
                    <Text style={styles.deleteText}>Delete</Text>
                </Animated.View>
            </HapticTouchableOpacity>
        );
    };

    return (
        <BlurView 
            intensity={isExpanded ? 90 : 70} 
            tint={colorScheme === 'dark' ? 'dark' : 'light'} 
            style={[styles.countryCard, {backgroundColor: theme.glass, borderColor: theme.glassBorder}, isExpanded && { borderColor: theme.primary, borderWidth: 1.5 }]}
        >
            <HapticTouchableOpacity 
                onPress={onToggle}
                activeOpacity={0.7}
                style={[styles.countryHeader, {backgroundColor: theme.glass}]}
                hapticType="selection"
            >
                <View pointerEvents="none" style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1}}>
                        <Text style={{fontSize: 32}}>{country.flag}</Text>
                        <View style={{flex: 1}}>
                            <Text style={[styles.countryName, {color: theme.textPrimary}]} numberOfLines={1} ellipsizeMode="tail">{country.country}</Text>
                            <Text style={[styles.countryCount, {color: theme.textSecondary}]}>{country.total} SCANS</Text>
                        </View>
                    </View>
                    <ChevronDown 
                        size={20} 
                        color={theme.textSecondary} 
                        style={{ 
                            transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] 
                        }} 
                    />
                </View>
            </HapticTouchableOpacity>

            {isExpanded && (
                <View style={styles.accordionBody}>
                    {getFilteredItemsCount(country) === 0 && (
                        <View style={{padding: 16, alignItems: 'center'}}>
                            <Text style={{color: '#94A3B8', fontSize: 12}}>No {filter.toUpperCase()} records in this trip.</Text>
                        </View>
                    )}
                    {(country.regions || []).map((region, rIdx) => {
                        const visibleItems = (region.items || []).filter(i => isAllowedItemType(i.type) && matchesFilter(i.type));
                        
                        return (
                            <View key={rIdx} style={{marginBottom: 16}}>
                                {visibleItems.length > 0 && (
                                    <Text style={[styles.regionTitle, {color: theme.primary}]}>{region.name}</Text>
                                )}
                                
                                {visibleItems.map((item, itemIdx) => (
                                    <View style={{marginBottom: 10}} key={`${country.country}-${region.name ?? rIdx}-${item.id}-${itemIdx}`}>
                                        <Swipeable
                                            ref={(ref) => {
                                                if (ref) swipeableRefs.current.set(item.id, ref);
                                                else swipeableRefs.current.delete(item.id);
                                            }}
                                            renderRightActions={(p, d) => renderRightActions(p, d, () => onDelete(item.id))}
                                            enabled={!isEditMode}
                                        >
                                            <HapticTouchableOpacity 
                                                style={[styles.itemRow, {backgroundColor: theme.surface, borderColor: theme.border}]}
                                                hapticType="light"
                                                onPress={() => {
                                                    if (isEditMode) {
                                                        onToggleItem(item.id);
                                                    } else {
                                                        dataStore.setData(item.originalRecord, item.originalRecord.location, item.originalRecord.imageUri || "");
                                                        router.push({ pathname: '/result', params: { fromStore: 'true' } });
                                                    }
                                                }}
                                            >
                                                <View 
                                                    style={{flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1}}
                                                    pointerEvents="none"
                                                >
                                                    {isEditMode && (
                                                        <View style={{marginRight: 4}}>
                                                            {selectedItems.has(item.id) ? (
                                                                <CheckCircle size={22} color="#2563EB" fill="#EFF6FF" />
                                                            ) : (
                                                                <Circle size={22} color="#CBD5E1" />
                                                            )}
                                                        </View>
                                                    )}
                                                    <View style={[styles.emojiBox, {backgroundColor: theme.background, borderColor: theme.border}]}>
                                                        {/* REPLACED: Text based emoji with FoodThumbnail */}
                                                        <FoodThumbnail 
                                                            uri={(item as any).imageUri} // Temporary cast until interface update
                                                            emoji={item.emoji}
                                                            style={{width: '100%', height: '100%', borderRadius: 16, backgroundColor: 'transparent'}}
                                                            imageStyle={{borderRadius: 12}}
                                                            fallbackFontSize={20}
                                                        />
                                                    </View>
                                                    <View style={{flex: 1}}>
                                                        <Text style={[styles.itemName, {color: theme.textPrimary}]} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
                                                        <Text style={[styles.itemDate, {color: theme.textSecondary}]}>{item.date}</Text>
                                                    </View>
                                                </View>
                                                    <View 
                                                        style={[
                                                            styles.statusIconBox,
                                                            item.type === 'ok' ? {backgroundColor: '#DCFCE7', borderColor: '#BBF7D0'} : 
                                                            item.type === 'avoid' ? {backgroundColor: '#FFE4E6', borderColor: '#FECDD3'} :
                                                            {backgroundColor: '#FEF9C3', borderColor: '#FDE047'}
                                                        ]}
                                                        pointerEvents="none"
                                                    >
                                                        {item.type === 'ok' ? (
                                                            <ShieldCheck size={16} color="#22C55E" />
                                                        ) : item.type === 'avoid' ? (
                                                            <AlertCircle size={16} color="#F43F5E" />
                                                        ) : (
                                                            <AlertTriangle size={16} color="#CA8A04" />
                                                        )}
                                                </View>
                                            </HapticTouchableOpacity>
                                        </Swipeable>
                                    </View>
                                ))}
                            </View>
                        );
                    })}
                </View>
            )}
        </BlurView>
    );
}

const styles = StyleSheet.create({
    countryCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1 },
    countryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
    countryName: { fontSize: 17, fontWeight: '900' },
    countryCount: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
    accordionBody: { padding: 8 },
    regionTitle: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginLeft: 12, marginTop: 8 },
    itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 22, borderWidth: 1 },
    deleteAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'flex-end', width: 100, height: '100%', paddingRight: 20, borderRadius: 22, marginLeft: -20 },
    deleteBtnContent: { alignItems: 'center', justifyContent: 'center' },
    deleteText: { color: 'white', fontWeight: '600', fontSize: 12, marginTop: 4 },
    emojiBox: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    itemName: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
    itemDate: { fontSize: 10, fontWeight: '500', marginTop: 2 },
    statusIconBox: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }
});
