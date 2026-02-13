import { SharedValue } from 'react-native-reanimated';
import { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

export interface ResultPinItem {
  name?: string;
  isAllergen?: boolean;
  displayX: number;
  displayY: number;
}

export interface PinOverlayProps {
  pins: ResultPinItem[];
  scrollY: SharedValue<number>;
}

export interface ResultHeaderProps {
  imageSource: ImageSourcePropType | null;
  imageAnimatedStyle: StyleProp<ViewStyle>;
  headerOverlayStyle: StyleProp<ViewStyle>;
  pins: ResultPinItem[];
  scrollY: SharedValue<number>;
  layoutStyle?: StyleProp<ViewStyle>;
}
