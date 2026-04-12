import { Dimensions } from 'react-native';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';

const { height } = Dimensions.get('window');

export const HEADER_HEIGHT = height * 0.46;
export const getResultUserId = (): string => getCurrentUserIdSnapshot();
