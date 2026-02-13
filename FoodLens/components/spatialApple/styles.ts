import { StyleSheet } from 'react-native';

export const spatialAppleStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  appleContainer: {
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  emoji: {
    textAlign: 'center',
  },
  glow: {
    position: 'absolute',
    width: '80%',
    height: '80%',
    backgroundColor: '#F43F5E',
    borderRadius: 100,
    zIndex: 1,
    // @ts-ignore
    filter: 'blur(20px)',
  },
  highlight: {
    position: 'absolute',
    top: '15%',
    right: '20%',
    zIndex: 3,
  },
  shine: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 20,
    transform: [{ rotate: '-45deg' }],
  },
});
