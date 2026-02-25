import { Dimensions } from 'react-native';
import { getCurrentUserId } from '@/services/auth/currentUser_Logic';

const { height } = Dimensions.get('window');

export const HEADER_HEIGHT = height * 0.65;
export const getResultUserId = (): string => getCurrentUserId();
