import { StyleSheet } from 'react-native';
import {
  FLOATING_EMOJIS_CONTAINER_SIZE,
  FLOATING_EMOJI_SIZE,
  FLOATING_POSITIONS,
} from './constants';

export const floatingEmojisStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: FLOATING_EMOJIS_CONTAINER_SIZE,
    height: FLOATING_EMOJIS_CONTAINER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  emojiContainer: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  emojiImage: {
    width: FLOATING_EMOJI_SIZE,
    height: FLOATING_EMOJI_SIZE,
  },
  pos1: FLOATING_POSITIONS.topCenter,
  pos2: FLOATING_POSITIONS.topLeft,
  pos3: FLOATING_POSITIONS.topRight,
});
