import { useEffect } from 'react';
import { AppState } from 'react-native';

type UseProfileSheetEffectsParams = {
  isOpen: boolean;
  userId: string;
  isTravelerLanguageModalVisible: boolean;
  isUiLanguageModalVisible: boolean;
  openProfile: () => void;
  openTravelerLanguageModal: () => void;
  openUiLanguageModal: () => void;
  loadProfile: () => Promise<void>;
  invalidateProfileLoad: () => void;
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
  invalidateProfileLoad,
}: UseProfileSheetEffectsParams) => {
  useEffect(() => {
    if (isOpen) openProfile();
  }, [isOpen, openProfile]);

  useEffect(() => {
    if (!isOpen) {
      invalidateProfileLoad();
      return;
    }
    void loadProfile();
    return () => {
      invalidateProfileLoad();
    };
  }, [isOpen, userId, loadProfile, invalidateProfileLoad]);

  useEffect(() => {
    if (!isOpen) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void loadProfile();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [isOpen, loadProfile]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      void loadProfile();
    }, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [isOpen, loadProfile]);

  useEffect(() => {
    if (isTravelerLanguageModalVisible) openTravelerLanguageModal();
  }, [isTravelerLanguageModalVisible, openTravelerLanguageModal]);

  useEffect(() => {
    if (isUiLanguageModalVisible) openUiLanguageModal();
  }, [isUiLanguageModalVisible, openUiLanguageModal]);
};
