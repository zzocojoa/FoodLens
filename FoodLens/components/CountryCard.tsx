import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Alert, Animated } from 'react-native'; // Animated imported
import { BlurView } from 'expo-blur';
import { ChevronDown, List, ShieldCheck, AlertCircle, AlertTriangle, Trash2, Circle, CheckCircle } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { CountryData } from '../models/History';
import { THEME } from '../constants/theme';
import { dataStore } from '../services/dataStore';

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
            <TouchableOpacity onPress={onClick} style={styles.deleteAction}>
                <Animated.View 
                    style={[styles.deleteBtnContent, { transform: [{ translateX: trans }] }]}
                    pointerEvents="none"
                >
                    <Trash2 size={24} color="white" />
                    <Text style={styles.deleteText}>Delete</Text>
                </Animated.View>
            </TouchableOpacity>
        );
    };

    return (
        <BlurView 
            intensity={isExpanded ? 90 : 70} 
            tint="light" 
            style={[styles.countryCard, THEME.glass, isExpanded && { borderColor: 'rgba(59, 130, 246, 0.5)', borderWidth: 1.5 }]}
        >
            <TouchableOpacity 
                onPress={onToggle}
                activeOpacity={0.7}
                style={[styles.countryHeader, isExpanded && { backgroundColor: 'rgba(255,255,255,0.6)' }]}
            >
                <View pointerEvents="none" style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1}}>
                        <Text style={{fontSize: 32}}>{country.flag}</Text>
                        <View style={{flex: 1}}>
                            <Text style={styles.countryName} numberOfLines={1} ellipsizeMode="tail">{country.country}</Text>
                            <Text style={styles.countryCount}>{country.total} SCANS</Text>
                        </View>
                    </View>
                    <ChevronDown 
                        size={20} 
                        color="#94A3B8" 
                        style={{ 
                            transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] 
                        }} 
                    />
                </View>
            </TouchableOpacity>

            {isExpanded && (
                <View style={styles.accordionBody}>
                    {getFilteredItemsCount(country) === 0 && (
                        <View style={{padding: 16, alignItems: 'center'}}>
                            <Text style={{color: '#94A3B8', fontSize: 12}}>No {filter.toUpperCase()} records in this trip.</Text>
                        </View>
                    )}
                    {(country.regions || []).map((region, rIdx) => (
                        <View key={rIdx} style={{marginBottom: 16}}>
                            {(region.items || []).some(i => isAllowedItemType(i.type) && matchesFilter(i.type)) && (
                                <Text style={styles.regionTitle}>{region.name}</Text>
                            )}
                            
                            {(region.items || [])
                                .filter(i => isAllowedItemType(i.type) && matchesFilter(i.type))
                                .map((item, itemIdx) => (
                                    <View style={{marginBottom: 10}} key={`${country.country}-${region.name ?? rIdx}-${item.id}-${itemIdx}`}>
                                        <Swipeable
                                            ref={(ref) => {
                                                if (ref) swipeableRefs.current.set(item.id, ref);
                                                else swipeableRefs.current.delete(item.id);
                                            }}
                                            renderRightActions={(p, d) => renderRightActions(p, d, () => onDelete(item.id))}
                                            enabled={!isEditMode}
                                        >
                                            <TouchableOpacity 
                                                style={styles.itemRow}
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
                                                    <View style={styles.emojiBox}>
                                                        <Text style={{fontSize: 20}}>{item.emoji}</Text>
                                                    </View>
                                                    <View style={{flex: 1}}>
                                                        <Text style={styles.itemName} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
                                                        <Text style={styles.itemDate}>{item.date}</Text>
                                                    </View>
                                                </View>
                                                <View 
                                                    style={[
                                                        styles.statusIconBox,
                                                        item.type === 'safe' ? {backgroundColor: '#DCFCE7', borderColor: '#BBF7D0'} : 
                                                        item.type === 'danger' ? {backgroundColor: '#FFE4E6', borderColor: '#FECDD3'} :
                                                        {backgroundColor: '#FEF9C3', borderColor: '#FDE047'}
                                                    ]}
                                                    pointerEvents="none"
                                                >
                                                    {item.type === 'safe' ? (
                                                        <ShieldCheck size={16} color="#22C55E" />
                                                    ) : item.type === 'danger' ? (
                                                        <AlertCircle size={16} color="#F43F5E" />
                                                    ) : (
                                                        <AlertTriangle size={16} color="#CA8A04" />
                                                    )}
                                                </View>
                                            </TouchableOpacity>
                                        </Swipeable>
                                    </View>
                                ))}
                        </View>
                    ))}
                </View>
            )}
        </BlurView>
    );
}

const styles = StyleSheet.create({
    countryCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'white' },
    countryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: 'rgba(255,255,255,0.3)' },
    countryName: { fontSize: 17, fontWeight: '900', color: '#0F172A' },
    countryCount: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 1, marginTop: 2 },
    accordionBody: { padding: 8 },
    regionTitle: { fontSize: 10, fontWeight: '900', color: 'rgba(59, 130, 246, 0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginLeft: 12, marginTop: 8 },
    itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.8)', padding: 16, borderRadius: 22, borderWidth: 1, borderColor: 'white' },
    deleteAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'flex-end', width: 100, height: '100%', paddingRight: 20, borderRadius: 22, marginLeft: -20 },
    deleteBtnContent: { alignItems: 'center', justifyContent: 'center' },
    deleteText: { color: 'white', fontWeight: '600', fontSize: 12, marginTop: 4 },
    emojiBox: { width: 44, height: 44, backgroundColor: '#F8FAFC', borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    itemName: { fontSize: 14, fontWeight: '700', color: '#0F172A', lineHeight: 18 },
    itemDate: { fontSize: 10, fontWeight: '500', color: '#94A3B8', marginTop: 2 },
    statusIconBox: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }
});
