import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface BoundingBoxOverlayProps {
  imageWidth: number;
  imageHeight: number;
  ingredients: {
    name: string;
    isAllergen: boolean;
    box_2d?: number[]; // [ymin, xmin, ymax, xmax] (0-1000)
  }[];
}

export const BoundingBoxOverlay: React.FC<BoundingBoxOverlayProps> = ({ 
  imageWidth, 
  imageHeight, 
  ingredients 
}) => {
  const [isVisible, setIsVisible] = useState(true);

  if (!ingredients || ingredients.length === 0) return null;

  // Toggle visibility on press
  const handlePress = () => {
    setIsVisible(!isVisible);
  };

  return (
    <TouchableOpacity 
      activeOpacity={1} 
      style={StyleSheet.absoluteFill} 
      onPress={handlePress}
    >
      {isVisible && ingredients.map((ing, index) => {
        if (!ing.box_2d || ing.box_2d.length < 4) return null;

        const [ymin, xmin, ymax, xmax] = ing.box_2d;
        
        // Convert normalized coordinates (0-1000) to pixel values
        const top = (ymin / 1000) * imageHeight;
        const left = (xmin / 1000) * imageWidth;
        const bottom = (ymax / 1000) * imageHeight;
        const right = (xmax / 1000) * imageWidth;
        
        const width = right - left;
        const height = bottom - top;

        const boxColor = ing.isAllergen ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.3)'; // Red for Danger, Blue for Safe
        const borderColor = ing.isAllergen ? '#EF4444' : '#3B82F6';

        return (
          <View
            key={`box-${index}`}
            style={{
              position: 'absolute',
              top,
              left,
              width,
              height,
              borderWidth: 2,
              borderColor: borderColor,
              backgroundColor: boxColor,
              borderRadius: 8,
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
            }}
          >
            <View style={{
                backgroundColor: borderColor,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderBottomRightRadius: 8,
                borderTopLeftRadius: 6,
            }}>
                <Text style={{ 
                    color: 'white', 
                    fontSize: 12, 
                    fontWeight: 'bold',
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowOffset: {width: 0, height: 1},
                    textShadowRadius: 2
                }}>
                    {ing.name} {ing.isAllergen && '⚠️'}
                </Text>
            </View>
          </View>
        );
      })}
    </TouchableOpacity>
  );
};
