import { ImageSourcePropType } from 'react-native';

export interface InfoBottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
}

export type GuideExample = {
    key: 'good' | 'bad';
    label: string;
    image: ImageSourcePropType;
    isBad?: boolean;
};
