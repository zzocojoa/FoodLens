import { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

export interface ResultHeaderProps {
  imageSource: ImageSourcePropType | null;
  imageAnimatedStyle: StyleProp<ViewStyle>;
  headerOverlayStyle: StyleProp<ViewStyle>;
  layoutStyle?: StyleProp<ViewStyle>;
  isBarcode?: boolean;
}
