import { useEffect } from 'react';
import { AppState } from 'react-native';

const PROFILE_SHEET_REFRESH_INTERVAL_MS = 30_000;
const PROFILE_SHEET_REFRESH_JITTER_WINDOW_MS = 3_000;

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
  resetLocalEdits: () => void;
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
  resetLocalEdits,
}: UseProfileSheetEffectsParams) => {
  useEffect(() => {
    if (isOpen) openProfile();
  }, [isOpen, openProfile]);

  useEffect(() => {
    if (!isOpen) {
      resetLocalEdits();
      invalidateProfileLoad();
      return;
    }
    void loadProfile();
    return () => {
      invalidateProfileLoad();
    };
  }, [isOpen, userId, loadProfile, invalidateProfileLoad, resetLocalEdits]);

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
    const randomizedIntervalMs = Math.max(
      1_000,
      PROFILE_SHEET_REFRESH_INTERVAL_MS +
        Math.floor(Math.random() * (PROFILE_SHEET_REFRESH_JITTER_WINDOW_MS * 2 + 1)) -
        PROFILE_SHEET_REFRESH_JITTER_WINDOW_MS
    );
    const timer = setInterval(() => {
      void loadProfile();
    }, randomizedIntervalMs);
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
