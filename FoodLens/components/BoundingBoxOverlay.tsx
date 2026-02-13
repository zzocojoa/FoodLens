import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { boundingBoxOverlayStyles as styles } from './boundingBoxOverlay/styles';
import { BoundingBoxOverlayProps } from './boundingBoxOverlay/types';
import {
  getBoundingBoxColors,
  hasRenderableBoundingBoxes,
  toBoundingBoxFrame,
} from './boundingBoxOverlay/utils';

export const BoundingBoxOverlay: React.FC<BoundingBoxOverlayProps> = ({ 
  imageWidth, 
  imageHeight, 
  ingredients 
}) => {
  const [isVisible, setIsVisible] = useState(true);

  if (!ingredients || ingredients.length === 0 || !hasRenderableBoundingBoxes(ingredients)) return null;

  const handlePress = () => {
    setIsVisible(!isVisible);
  };

  return (
    <TouchableOpacity 
      activeOpacity={1} 
      style={styles.overlay} 
      onPress={handlePress}
    >
      {isVisible && ingredients.map((ing, index) => {
        if (!ing.box_2d || ing.box_2d.length < 4) return null;

        const frame = toBoundingBoxFrame(ing.box_2d, imageWidth, imageHeight);
        const colors = getBoundingBoxColors(ing.isAllergen);

        return (
          <View
            key={`box-${index}`}
            style={{
              ...styles.box,
              ...frame,
              borderColor: colors.borderColor,
              backgroundColor: colors.boxColor,
            }}
          >
            <View style={[styles.labelContainer, { backgroundColor: colors.borderColor }]}>
                <Text style={styles.labelText}>
                    {ing.name} {ing.isAllergen && '⚠️'}
                </Text>
            </View>
          </View>
        );
      })}
    </TouchableOpacity>
  );
};
