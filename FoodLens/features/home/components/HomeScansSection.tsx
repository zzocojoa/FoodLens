import React from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { FoodThumbnail } from '../../../components/FoodThumbnail';
import { HapticTouchableOpacity } from '../../../components/HapticFeedback';
import { AnalysisRecord } from '../../../services/analysisService';
import { getBarcodeImageUri, resolveImageUri } from '../../../services/imageStorage';
import { formatDate, getEmoji } from '../../../services/utils';
import { homeStyles as styles } from '../styles/homeStyles';
import { formatHomeSectionTitle, getHomeScanStatusBadge } from '../utils/homeUi';
import { getLocalizedFoodName } from '../utils/localizedFoodName';

type HomeScansSectionProps = {
  filteredScans: AnalysisRecord[];
  selectedDate: Date;
  theme: any;
  t: (key: string, fallback?: string) => string;
  locale: string;
  onOpenHistory: () => void;
  onOpenResult: (item: AnalysisRecord) => void;
  onDeleteItem: (itemId: string) => void;
};

export default function HomeScansSection({
  filteredScans,
  selectedDate,
  theme,
  t,
  locale,
  onOpenHistory,
  onOpenResult,
  onDeleteItem,
}: HomeScansSectionProps) {
  const renderRightActions = (dragX: any, onClick: () => void) => {
    const trans = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity onPress={onClick} style={styles.deleteAction}>
        <Animated.View
          style={[styles.deleteBtnContent, { transform: [{ translateX: trans }] }]}
          pointerEvents="none"
        >
          <Trash2 size={24} color="white" />
          <Text style={styles.deleteText}>{t('common.delete', 'Delete')}</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
          {formatHomeSectionTitle(selectedDate, t, locale)}
        </Text>
        <HapticTouchableOpacity onPress={onOpenHistory} hapticType="selection">
          <View pointerEvents="none">
            <Text style={[styles.seeAllText, { color: theme.primary }]}>
              {t('home.scans.seeAll', 'See All')}
            </Text>
          </View>
        </HapticTouchableOpacity>
      </View>

      <View style={styles.scanList}>
        {filteredScans.length > 0 ? (
          filteredScans.map((item, index) => {
            const badgeStyle = getHomeScanStatusBadge(item.safetyStatus);
            const localizedFoodName = getLocalizedFoodName(item, locale);
            return (
              <View key={`${item.id}-${index}`} style={{ marginBottom: 12 }}>
                <Swipeable
                  renderRightActions={(_, dragX) =>
                    renderRightActions(dragX, () => onDeleteItem(item.id))
                  }
                >
                  <HapticTouchableOpacity
                    style={[
                      styles.scanItem,
                      { marginBottom: 0 },
                      {
                        backgroundColor: theme.glass,
                        borderColor: theme.glassBorder,
                      },
                    ]}
                    activeOpacity={0.7}
                    hapticType="light"
                    onPress={() => onOpenResult(item)}
                  >
                    <View style={styles.scanInfo}>
                      <View style={[styles.scanEmojiBox, { backgroundColor: theme.surface }]}>
                        <FoodThumbnail
                          uri={item.isBarcode ? getBarcodeImageUri() : (resolveImageUri(item.imageUri) || undefined)}
                          emoji={getEmoji(localizedFoodName)}
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: 16,
                            backgroundColor: 'transparent',
                          }}
                          imageStyle={{ borderRadius: 12 }}
                          fallbackFontSize={24}
                        />
                      </View>
                      <View>
                        <Text style={[styles.scanName, { color: theme.textPrimary }]}>{localizedFoodName}</Text>
                        <Text style={[styles.scanDate, { color: theme.textSecondary }]}>
                          {formatDate(item.timestamp, locale)}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.badge, { backgroundColor: badgeStyle.backgroundColor }]}>
                      <Text style={[styles.badgeText, { color: badgeStyle.textColor }]}>
                        {badgeStyle.label}
                      </Text>
                    </View>
                  </HapticTouchableOpacity>
                </Swipeable>
              </View>
            );
          })
        ) : (
          <View style={{ paddingVertical: 32, alignItems: 'center', opacity: 0.5 }}>
            <Text
              style={{
                textAlign: 'center',
                color: theme.textSecondary,
                fontSize: 16,
                fontWeight: '500',
              }}
            >
              {t('home.scans.empty.title', 'No records for this day')}
            </Text>
            <Text
              style={{
                textAlign: 'center',
                color: theme.textSecondary,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              {t('home.scans.empty.subtitle', 'Try analyzing a new meal!')}
            </Text>
          </View>
        )}
      </View>
    </>
  );
}
