import { useEffect } from 'react';

type UseProfileSheetEffectsParams = {
  isOpen: boolean;
  userId: string;
  isLanguageModalVisible: boolean;
  openProfile: () => void;
  openLanguageModal: () => void;
  loadProfile: () => Promise<void>;
};

export const useProfileSheetEffects = ({
  isOpen,
  userId,
  isLanguageModalVisible,
  openProfile,
  openLanguageModal,
  loadProfile,
}: UseProfileSheetEffectsParams) => {
  useEffect(() => {
    if (isOpen) openProfile();
  }, [isOpen, openProfile]);

  useEffect(() => {
    if (isOpen) {
      void loadProfile();
    }
  }, [isOpen, userId, loadProfile]);

  useEffect(() => {
    if (isLanguageModalVisible) openLanguageModal();
  }, [isLanguageModalVisible, openLanguageModal]);
};
