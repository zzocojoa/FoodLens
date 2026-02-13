import { useProfileSheetEffects } from './useProfileSheetEffects';
import { useProfileSheetState } from './useProfileSheetState';
import { useSheetGesture } from './useSheetGesture';
import { ProfileSheetProps } from '../types';

export const useProfileSheetController = ({ isOpen, onClose, userId }: ProfileSheetProps) => {
  const state = useProfileSheetState(userId);

  const profileSheet = useSheetGesture(onClose);
  const travelerLanguageSheet = useSheetGesture(() => state.setTravelerLangModalVisible(false));
  const uiLanguageSheet = useSheetGesture(() => state.setUiLangModalVisible(false));

  useProfileSheetEffects({
    isOpen,
    userId,
    isTravelerLanguageModalVisible: state.travelerLangModalVisible,
    isUiLanguageModalVisible: state.uiLangModalVisible,
    openProfile: profileSheet.openSheet,
    openTravelerLanguageModal: travelerLanguageSheet.openSheet,
    openUiLanguageModal: uiLanguageSheet.openSheet,
    loadProfile: state.loadProfile,
  });

  return {
    state,
    profileSheet,
    travelerLanguageSheet,
    uiLanguageSheet,
  };
};
