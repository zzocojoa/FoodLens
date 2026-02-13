import { Region } from 'react-native-maps';
import { INITIAL_REGION } from '../constants';

export const resolveInitialRegion = (initialRegion?: Region | null): Region =>
  initialRegion || INITIAL_REGION;
