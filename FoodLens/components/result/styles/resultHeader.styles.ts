import { Dimensions, StyleSheet } from 'react-native';

const { height } = Dimensions.get('window');
export const RESULT_HEADER_HEIGHT = height * 0.6;

export const resultHeaderStyles = StyleSheet.create({
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: RESULT_HEADER_HEIGHT,
    zIndex: 0,
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '25%',
  },
});
