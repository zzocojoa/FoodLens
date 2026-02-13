import { StyleSheet } from 'react-native';

export const boundingBoxOverlayStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 8,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  labelContainer: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 6,
  },
  labelText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
