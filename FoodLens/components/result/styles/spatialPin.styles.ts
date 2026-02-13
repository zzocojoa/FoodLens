import { StyleSheet } from 'react-native';

export const spatialPinStyles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
  pinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 100,
    transform: [{ translateX: -50 }, { translateY: -50 }],
  },
  pinPulse: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    opacity: 0.3,
  },
  pinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: 'black',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  pinLabel: {
    position: 'absolute',
    top: 60,
  },
  pinLabelBlur: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pinLabelText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
