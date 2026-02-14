import { Dimensions } from 'react-native';
import { CURRENT_USER_ID } from '@/services/auth/currentUser';

const { height } = Dimensions.get('window');

export const HEADER_HEIGHT = height * 0.65;
export const TEST_UID = CURRENT_USER_ID;
