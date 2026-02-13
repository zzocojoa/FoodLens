import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Alert } from 'react-native';
import { saveImagePermanently } from '@/services/imageStorage';

export const persistProfileImageIfNeeded = async (image: string): Promise<string> => {
  if (!image.startsWith('file://')) return image;
  const filename = await saveImagePermanently(image);
  if (!filename) throw new Error('이미지 저장에 실패했습니다.');
  return filename;
};

export const pickProfileImageUri = async (useCamera: boolean): Promise<string | null> => {
  let result: ImagePicker.ImagePickerResult;

  if (useCamera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Needed', 'Camera access is required.');
      return null;
    }
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
  }

  if (result.canceled || !result.assets[0]?.uri) return null;

  const uri = result.assets[0].uri;
  if (useCamera) {
    try {
      await MediaLibrary.saveToLibraryAsync(uri);
    } catch (error) {
      console.error('Failed to save profile photo to gallery:', error);
    }
  }
  return uri;
};
