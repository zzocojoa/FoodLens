import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

// 2026 Design Tokens
const THEME = {
    glass: {
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        borderColor: 'rgba(255, 255, 255, 0.4)',
        borderWidth: 1,
        overflow: 'hidden',
    },
    activeDay: {
        backgroundColor: '#0F172A', // Slate 900
    },
    inactiveDay: {
        backgroundColor: 'transparent',
    },
    textActive: '#FFFFFF',
    textInactive: '#64748B', // Slate 500
    textDisabled: '#CBD5E1', // Slate 300
};

export interface WeeklyData {
    date: Date;
    hasSafe: boolean;
    hasDanger: boolean;
    hasWarning: boolean;
    hasData: boolean;
}

interface WeeklyStatsStripProps {
    weeklyData: WeeklyData[];
    selectedDate: Date;
    onSelectDate: (date: Date) => void;
}

// Utility to check if two dates are the same day
const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

export function WeeklyStatsStrip({ weeklyData, selectedDate, onSelectDate }: WeeklyStatsStripProps) {
    const scrollViewRef = useRef<ScrollView>(null);

    // Auto-scroll to selected date on mount or change
    useEffect(() => {
        const index = weeklyData.findIndex(d => isSameDay(d.date, selectedDate));
        if (index !== -1 && scrollViewRef.current) {
            // Center the item: (Index * ItemWidth) - (ScreenCenter - ItemHalfWidth)
            // Item Width approx 60 + margin 8 = 68
            // Simple approach: scroll to index * 68
            setTimeout(() => {
                 scrollViewRef.current?.scrollTo({ x: index * 68 - (Dimensions.get('window').width / 2) + 34, animated: true });
            }, 100);
        }
    }, [selectedDate, weeklyData]);

    const formatDateDay = (date: Date) => {
        // "Sun", "Mon" etc.
        return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
    };

    const formatDateNumber = (date: Date) => {
        return date.getDate();
    };

    return (
        <View style={styles.container}>
            <ScrollView
                ref={scrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                decelerationRate="fast"
                snapToInterval={68} // item width + gap
            >
                {weeklyData.map((day, index) => {
                    const isSelected = isSameDay(day.date, selectedDate);
                    const isToday = isSameDay(day.date, new Date());
                    const isEmpty = !day.hasData; 
                    
                    return (
                        <TouchableOpacity
                            key={index}
                            onPress={() => {
                                Haptics.selectionAsync();
                                onSelectDate(day.date);
                            }}
                            activeOpacity={0.7}
                            style={[
                                styles.dayItem,
                                isSelected ? styles.selectedItem : styles.unselectedItem
                            ]}
                        >
                            <Text style={[
                                styles.dayLabel, 
                                isSelected ? styles.textSelected : styles.textUnselected
                            ]}>
                                {formatDateDay(day.date)}
                            </Text>
                            
                            <Text style={[
                                styles.dateNumber,
                                isSelected ? styles.textSelected : (isEmpty ? styles.textDisabled : styles.textUnselected)
                            ]}>
                                {formatDateNumber(day.date)}
                            </Text>

                            {/* Status Dots Container */}
                            <View style={styles.dotsContainer}>
                                {day.hasData ? (
                                    <>
                                        {/* Order: Green -> Red -> Yellow */}
                                        {day.hasSafe && <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />}
                                        {day.hasDanger && <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />}
                                        {day.hasWarning && <View style={[styles.statusDot, { backgroundColor: '#EAB308' }]} />}
                                    </>
                                ) : (
                                    // Placeholder for layout stability
                                    <View style={[styles.statusDot, { backgroundColor: 'transparent' }]} />
                                )}
                            </View>
                            
                            {/* Today Indicator (if not selected, maybe small dot at top? or just text weight) */}
                            {isToday && !isSelected && (
                                <View style={styles.todayIndicator} />
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 6,
        height: 80,
        marginTop: 0, 
    },
    scrollContent: {
        paddingHorizontal: 24,
        gap: 8,
        alignItems: 'center',
    },
    dayItem: {
        width: 60,
        height: 72,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderWidth: 1,
    },
    selectedItem: {
        backgroundColor: 'transparent', // Removed dark background
        borderColor: '#000000',         
        borderWidth: 0, 
    },
    unselectedItem: {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
    },
    dayLabel: {
        fontSize: 12,
        fontWeight: '500',
    },
    dateNumber: {
        fontSize: 18,
        fontWeight: '700',
    },
    textSelected: {
        color: '#000000', // Black
    },
    textUnselected: {
        color: '#94A3B8', // Lighter Gray
    },
    textDisabled: {
        color: '#E2E8F0', // Very light for empty
    },
    dotsContainer: {
        flexDirection: 'row',
        gap: 3,
        height: 6, 
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 2,
    },
    statusDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    todayIndicator: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#3B82F6', // Blue indicator for today
    }
});
