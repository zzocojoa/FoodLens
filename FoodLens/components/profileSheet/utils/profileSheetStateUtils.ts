import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { saveImagePermanentlyOrThrow } from '@/services/imageStorage';
import { showOpenSettingsAlert } from '@/services/ui/permissionDialogs';

type CameraPermissionDialogTexts = {
  title: string;
  message: string;
  cancelLabel: string;
  settingsLabel: string;
};

export const persistProfileImageIfNeeded = async (image: string): Promise<string> => {
  if (!image.startsWith('file://')) return image;
  return saveImagePermanentlyOrThrow(image, '이미지 저장에 실패했습니다.');
};

export const pickProfileImageUri = async (
  useCamera: boolean,
  cameraPermissionDialogTexts: CameraPermissionDialogTexts
): Promise<string | null> => {
  let result: ImagePicker.ImagePickerResult;

  if (useCamera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showOpenSettingsAlert(cameraPermissionDialogTexts);
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
