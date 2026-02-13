import { useEffect } from 'react';

type UseProfileSheetEffectsParams = {
  isOpen: boolean;
  userId: string;
  isTravelerLanguageModalVisible: boolean;
  isUiLanguageModalVisible: boolean;
  openProfile: () => void;
  openTravelerLanguageModal: () => void;
  openUiLanguageModal: () => void;
  loadProfile: () => Promise<void>;
};

export const useProfileSheetEffects = ({
  isOpen,
  userId,
  isTravelerLanguageModalVisible,
  isUiLanguageModalVisible,
  openProfile,
  openTravelerLanguageModal,
  openUiLanguageModal,
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
    if (isTravelerLanguageModalVisible) openTravelerLanguageModal();
  }, [isTravelerLanguageModalVisible, openTravelerLanguageModal]);

  useEffect(() => {
    if (isUiLanguageModalVisible) openUiLanguageModal();
  }, [isUiLanguageModalVisible, openUiLanguageModal]);
};
