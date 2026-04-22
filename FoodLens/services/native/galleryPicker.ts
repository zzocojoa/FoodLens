import { NativeModules, Platform } from 'react-native';

type GalleryPickerNativeModule = {
  pickImage: () => Promise<string | null>;
};

const getGalleryPickerModule = (): GalleryPickerNativeModule => {
  const nativeModule = NativeModules['GalleryPickerModule'] as Partial<GalleryPickerNativeModule> | undefined;
  if (!nativeModule?.pickImage) {
    throw new Error('GalleryPickerModule is not available.');
  }

  return nativeModule as GalleryPickerNativeModule;
};

export const pickGalleryImage = async (): Promise<string | null> => {
  if (Platform.OS !== 'android') {
    throw new Error('Gallery picker is only available on Android.');
  }

  const galleryPickerModule = getGalleryPickerModule();
  return galleryPickerModule.pickImage();
};
