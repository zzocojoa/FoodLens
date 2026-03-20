import { Platform } from 'react-native';
import { useProfileSheetEffects } from './useProfileSheetEffects';
import { useProfileSheetState } from './useProfileSheetState';
import { useSheetGesture } from './useSheetGesture';
import { ProfileSheetProps } from '../types';

export const useProfileSheetController = ({ isOpen, onClose, userId }: ProfileSheetProps) => {
  const state = useProfileSheetState(userId);
  const shouldAnimateLanguageModalOpen = Platform.OS !== 'android';
  const shouldAnimateLanguageModalClose = Platform.OS !== 'android';

  const profileSheet = useSheetGesture(onClose, {
    animateOnOpen: true,
    animateOnClose: true,
  });
  const travelerLanguageSheet = useSheetGesture(
    () => state.setTravelerLangModalVisible(false),
    {
      animateOnOpen: shouldAnimateLanguageModalOpen,
      animateOnClose: shouldAnimateLanguageModalClose,
    },
  );
  const uiLanguageSheet = useSheetGesture(
    () => state.setUiLangModalVisible(false),
    {
      animateOnOpen: shouldAnimateLanguageModalOpen,
      animateOnClose: shouldAnimateLanguageModalClose,
    },
  );

  useProfileSheetEffects({
    isOpen,
    userId,
    isTravelerLanguageModalVisible: state.travelerLangModalVisible,
    isUiLanguageModalVisible: state.uiLangModalVisible,
    openProfile: profileSheet.openSheet,
    openTravelerLanguageModal: travelerLanguageSheet.openSheet,
    openUiLanguageModal: uiLanguageSheet.openSheet,
    loadProfile: state.loadProfile,
    invalidateProfileLoad: state.invalidateProfileLoad,
    resetLocalEdits: state.resetLocalEdits,
  });

  return {
    state,
    profileSheet,
    travelerLanguageSheet,
    uiLanguageSheet,
  };
};
