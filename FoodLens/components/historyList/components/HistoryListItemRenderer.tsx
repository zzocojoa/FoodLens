import React from 'react';
import { Text, View } from 'react-native';
import { CheckCircle, Circle } from 'lucide-react-native';
import CountryCardHeader from '@/components/historyList/components/CountryCardHeader';
import { getStatusMeta } from '@/components/historyList/utils/historyListUtils';
import { renderStatusIcon } from '@/components/historyList/utils/statusIconMap';
import { HistoryListItemRendererProps } from '@/components/historyList/types';
import { historyListViewStyles as styles } from '@/components/historyList/styles';
import { FoodThumbnail } from '@/components/FoodThumbnail';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';

export default function HistoryListItemRenderer({
  item,
  colorScheme,
  theme,
  expandedCountries,
  onToggleCountry,
  isEditMode,
  selectedItems,
  onFoodItemPress,
}: HistoryListItemRendererProps) {
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
      return <Text style={[styles.regionTitle, { color: theme.primary }]}>{item.name}</Text>;
    case 'food-item': {
      const statusMeta = getStatusMeta(item.data.type);
      return (
        <View style={styles.itemWrapper}>
          <HapticTouchableOpacity
            style={[styles.itemRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
            hapticType="light"
            onPress={() => onFoodItemPress(item.data)}
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
          <Text style={{ color: '#94A3B8', fontSize: 12 }}>No {item.filter.toUpperCase()} records in this trip.</Text>
        </View>
      );
    default:
      return null;
  }
}
