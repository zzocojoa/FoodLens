import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { boundingBoxOverlayStyles as styles } from './boundingBoxOverlay/styles';
import { BoundingBoxOverlayProps } from './boundingBoxOverlay/types';
import { getBoundingBoxColors } from './boundingBoxOverlay/utils';
import { useBoundingBoxOverlayState } from './boundingBoxOverlay/hooks/useBoundingBoxOverlayState';

export const BoundingBoxOverlay: React.FC<BoundingBoxOverlayProps> = ({ 
  imageWidth, 
  imageHeight, 
  ingredients 
}) => {
  const { isVisible, hasBoxes, renderItems, toggleVisibility } = useBoundingBoxOverlayState({
    imageWidth,
    imageHeight,
    ingredients,
  });

  if (!ingredients || ingredients.length === 0 || !hasBoxes) return null;

  return (
    <TouchableOpacity 
      activeOpacity={1} 
      style={styles.overlay} 
      onPress={toggleVisibility}
    >
      {isVisible && renderItems.map((item) => {
        const colors = getBoundingBoxColors(item.isAllergen);

        return (
          <View
            key={item.key}
            style={{
              ...styles.box,
              ...item.frame,
              borderColor: colors.borderColor,
              backgroundColor: colors.boxColor,
            }}
          >
            <View style={[styles.labelContainer, { backgroundColor: colors.borderColor }]}>
                <Text style={styles.labelText}>
                    {item.name} {item.isAllergen && '⚠️'}
                </Text>
            </View>
          </View>
        );
      })}
    </TouchableOpacity>
  );
};
