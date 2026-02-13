import { ImageSourcePropType } from 'react-native';

export const FLOAT_DURATIONS = [2000, 2400, 2200] as const;
export const FLOATING_EMOJIS_CONTAINER_SIZE = 200;
export const FLOATING_EMOJI_SIZE = 60;
export const FLOATING_POSITIONS = {
  topCenter: { top: 0, left: 70 },
  topLeft: { top: 30, left: 20 },
  topRight: { top: 30, right: 20 },
} as const;

export type FloatingItemConfig = {
  key: string;
  positionStyle: 'pos1' | 'pos2' | 'pos3';
  outputRange: [number, number];
  source: ImageSourcePropType;
};

export const FLOATING_ITEMS: FloatingItemConfig[] = [
  {
    key: 'egg',
    positionStyle: 'pos1',
    outputRange: [0, -15],
    source: require('../../assets/images/allergens/egg.png'),
  },
  {
    key: 'peanut',
    positionStyle: 'pos2',
    outputRange: [0, -20],
    source: require('../../assets/images/allergens/peanut.png'),
  },
  {
    key: 'soy',
    positionStyle: 'pos3',
    outputRange: [0, -12],
    source: require('../../assets/images/allergens/soy.png'),
  },
];
