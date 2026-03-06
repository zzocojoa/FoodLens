import { Dimensions } from 'react-native';
import { GuideExample } from './types';

export const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const SHEET_DISMISS_DISTANCE = 100;
export const SHEET_DISMISS_VELOCITY = 500;
export const SHEET_EXIT_DURATION_MS = 250;

export const GUIDE_EXAMPLES: GuideExample[] = [
    {
        key: 'good',
        label: 'Good photo example',
        image: require('@/assets/images/guide-good.jpg'),
    },
    {
        key: 'bad',
        label: 'Poor photo example',
        image: require('@/assets/images/guide-bad.jpg'),
        isBad: true,
    },
];
