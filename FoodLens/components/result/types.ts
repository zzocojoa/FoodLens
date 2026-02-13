import { SharedValue } from 'react-native-reanimated';

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
  imageSource: any;
  imageAnimatedStyle: any;
  headerOverlayStyle: any;
  pins: ResultPinItem[];
  scrollY: SharedValue<number>;
  layoutStyle?: any;
}
