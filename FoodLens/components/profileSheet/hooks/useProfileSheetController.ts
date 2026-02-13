import { useProfileSheetEffects } from './useProfileSheetEffects';
import { useProfileSheetState } from './useProfileSheetState';
import { useSheetGesture } from './useSheetGesture';
import { ProfileSheetProps } from '../types';

export const useProfileSheetController = ({ isOpen, onClose, userId }: ProfileSheetProps) => {
  const state = useProfileSheetState(userId);

  const profileSheet = useSheetGesture(onClose);
  const languageSheet = useSheetGesture(() => state.setLangModalVisible(false));

  useProfileSheetEffects({
    isOpen,
    userId,
    isLanguageModalVisible: state.langModalVisible,
    openProfile: profileSheet.openSheet,
    openLanguageModal: languageSheet.openSheet,
    loadProfile: state.loadProfile,
  });

  return {
    state,
    profileSheet,
    languageSheet,
  };
};
