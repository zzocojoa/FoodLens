import React from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle, Circle, Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import CountryCardHeader from '@/components/historyList/components/CountryCardHeader';
import { getStatusMeta } from '@/components/historyList/utils/historyListUtils';
import { renderStatusIcon } from '@/components/historyList/utils/statusIconMap';
import { HistoryListItemRendererProps } from '@/components/historyList/types';
import { historyListViewStyles as styles } from '@/components/historyList/styles';
import { FoodThumbnail } from '@/components/FoodThumbnail';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { useI18n } from '@/features/i18n';
import { formatCalendarDate } from '@/features/i18n/services/formatService_Logic';

export default function HistoryListItemRenderer({
  item,
  colorScheme,
  theme,
  expandedCountries,
  onToggleCountry,
  isEditMode,
  selectedItems,
  onToggleItem,
  onDelete,
  onFoodItemPress,
}: HistoryListItemRendererProps) {
  const { t, locale } = useI18n();

  const renderRightActions = (dragX: Animated.AnimatedInterpolation<number>, onPressDelete: () => void) => {
    const trans = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity onPress={onPressDelete} style={styles.deleteAction}>
        <Animated.View style={[styles.deleteBtnContent, { transform: [{ translateX: trans }] }]} pointerEvents="none">
          <Trash2 size={20} color="#FFFFFF" />
          <Text style={styles.deleteText}>{t('common.delete', 'Delete')}</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

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
          <Swipeable
            enabled={!isEditMode}
            renderRightActions={(_, dragX) =>
              renderRightActions(dragX as Animated.AnimatedInterpolation<number>, () => onDelete(item.id))
            }
          >
            <HapticTouchableOpacity
              style={[styles.itemRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              hapticType="light"
              onPress={() => onFoodItemPress(item.data)}
            >
              <View style={styles.itemMainContent}>
                {isEditMode && (
                  <TouchableOpacity
                    style={styles.selectionToggleButton}
                    onPress={() => onToggleItem(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {selectedItems.has(item.id) ? (
                      <CheckCircle size={22} color="#2563EB" fill="#EFF6FF" />
                    ) : (
                      <Circle size={22} color="#CBD5E1" />
                    )}
                  </TouchableOpacity>
                )}
                <View style={styles.itemBody} pointerEvents="none">
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
                    <Text style={[styles.itemDate, { color: theme.textSecondary }]}>
                      {formatCalendarDate(item.data.timestamp, locale)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={[styles.statusIconBox, statusMeta.containerStyle]} pointerEvents="none">
                {renderStatusIcon(statusMeta.kind)}
              </View>
            </HapticTouchableOpacity>
          </Swipeable>
        </View>
      );
    }
    case 'empty-region':
      return (
        <View style={styles.emptyRegionContainer}>
          <Text style={{ color: '#94A3B8', fontSize: 12 }}>
            {t('history.empty.noFilterRecordsTemplate', 'No {filter} records in this trip.').replace(
              '{filter}',
              item.filter.toUpperCase()
            )}
          </Text>
        </View>
      );
    default:
      return null;
  }
}
