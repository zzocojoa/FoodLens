import React from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { FoodThumbnail } from '../../../components/FoodThumbnail';
import { HapticTouchableOpacity } from '../../../components/HapticFeedback';
import { AnalysisRecord } from '../../../services/analysisService';
import { resolveImageUri } from '../../../services/imageStorage';
import { formatDate, getEmoji } from '../../../services/utils';
import { homeStyles as styles } from '../styles/homeStyles';
import { formatHomeSectionTitle, getHomeScanStatusBadge } from '../utils/homeUi';

type HomeScansSectionProps = {
  filteredScans: AnalysisRecord[];
  selectedDate: Date;
  theme: any;
  onOpenHistory: () => void;
  onOpenResult: (item: AnalysisRecord) => void;
  onDeleteItem: (itemId: string) => void;
};

export default function HomeScansSection({
  filteredScans,
  selectedDate,
  theme,
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
          <Text style={styles.deleteText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
          {formatHomeSectionTitle(selectedDate)}
        </Text>
        <HapticTouchableOpacity onPress={onOpenHistory} hapticType="selection">
          <View pointerEvents="none">
            <Text style={[styles.seeAllText, { color: theme.primary }]}>See All</Text>
          </View>
        </HapticTouchableOpacity>
      </View>

      <View style={styles.scanList}>
        {filteredScans.length > 0 ? (
          filteredScans.map((item, index) => {
            const badgeStyle = getHomeScanStatusBadge(item.safetyStatus);
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
                          uri={resolveImageUri(item.imageUri) || undefined}
                          emoji={getEmoji(item.foodName)}
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
                        <Text style={[styles.scanName, { color: theme.textPrimary }]}>{item.foodName}</Text>
                        <Text style={[styles.scanDate, { color: theme.textSecondary }]}>
                          {formatDate(item.timestamp)}
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
              No records for this day
            </Text>
            <Text
              style={{
                textAlign: 'center',
                color: theme.textSecondary,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              Try analyzing a new meal!
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

