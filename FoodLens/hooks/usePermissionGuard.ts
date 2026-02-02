import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

type PermissionType = 'camera' | 'mediaLibrary' | 'location';

export const usePermissionGuard = () => {
  const [cameraStatus, requestCamera] = ImagePicker.useCameraPermissions();
  const [libraryStatus, requestLibrary] = ImagePicker.useMediaLibraryPermissions();
  const [locationStatus, requestLocation] = Location.useForegroundPermissions();

  const checkAndRequest = async (type: PermissionType, isOptional = false): Promise<boolean> => {
    let status;
    let requestFunc;
    let permissionName = "";
    let rationale = "";

    switch (type) {
      case 'camera':
        status = cameraStatus;
        requestFunc = requestCamera;
        permissionName = "Camera";
        rationale = "FoodLens needs camera access to analyze your meal.";
        break;
      case 'mediaLibrary':
        status = libraryStatus;
        requestFunc = requestLibrary;
        permissionName = "Photos";
        rationale = "FoodLens needs photo library access to choose images for analysis.";
        break;
      case 'location':
        status = locationStatus;
        requestFunc = requestLocation;
        permissionName = "Location";
        rationale = "FoodLens uses location to tag your food verification.";
        break;
    }

    // 1. If already granted, return true
    if (status?.granted) {
      return true;
    }

    // 2. If we can ask, ask now
    if (status?.canAskAgain || status?.status === 'undetermined') {
      const result = await requestFunc();
      return result.granted;
    }

    // 3. If denied and cannot ask again (Settings needed), show alert if NOT optional
    if (!isOptional) {
      Alert.alert(
        `${permissionName} Permission Required`,
        rationale,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Open Settings", 
            onPress: () => Linking.openSettings() 
          }
        ]
      );
    }

    return false;
  };

  return { 
    checkAndRequest,
    cameraStatus,
    libraryStatus,
    locationStatus
  };
};
