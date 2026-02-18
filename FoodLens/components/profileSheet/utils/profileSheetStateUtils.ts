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

const resolveAssetUriForPersistence = async (
  asset: ImagePicker.ImagePickerAsset
): Promise<string> => {
  if (!asset.uri) return asset.uri;
  const isPhotoLibraryScheme =
    asset.uri.startsWith('ph://') || asset.uri.startsWith('assets-library://');
  if (!isPhotoLibraryScheme || !asset.assetId) {
    return asset.uri;
  }

  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
    if (info.localUri?.startsWith('file://')) {
      return info.localUri;
    }
  } catch (error) {
    console.warn('[ProfileImage] Failed to resolve MediaLibrary localUri:', error);
  }
  return asset.uri;
};

export const persistProfileImageIfNeeded = async (image: string): Promise<string> => {
  const isRemoteImage = image.startsWith('http://') || image.startsWith('https://');
  if (isRemoteImage) return image;
  try {
    return await saveImagePermanentlyOrThrow(image, '이미지 저장에 실패했습니다.');
  } catch (error) {
    // Release on iOS may return ph:// URI that copyAsync cannot persist.
    // Keep original URI to avoid dropping the user's profile photo update.
    console.warn('[ProfileImage] Falling back to original URI without persistence:', error);
    return image;
  }
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

  const uri = await resolveAssetUriForPersistence(result.assets[0]);
  if (useCamera) {
    try {
      await MediaLibrary.saveToLibraryAsync(uri);
    } catch (error) {
      console.error('Failed to save profile photo to gallery:', error);
    }
  }
  return uri;
};
