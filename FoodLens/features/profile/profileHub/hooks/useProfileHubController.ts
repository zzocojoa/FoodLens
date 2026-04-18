import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useProfileHubState } from './useProfileHubState';
import { useModalSheetGesture } from './useModalSheetGesture';
import { ProfileHubControllerParams } from '../types';

const PROFILE_HUB_REFRESH_INTERVAL_MS = 15_000;

export const useProfileHubController = ({ userId }: ProfileHubControllerParams) => {
    const state = useProfileHubState(userId);
    const shouldAnimateLanguageModalOpen = Platform.OS !== 'android';
    const shouldAnimateLanguageModalClose = Platform.OS !== 'android';

    const travelerLanguageSheet = useModalSheetGesture(
        () => state.setTravelerLangModalVisible(false),
        {
            animateOnOpen: shouldAnimateLanguageModalOpen,
            animateOnClose: shouldAnimateLanguageModalClose,
        },
    );
    const uiLanguageSheet = useModalSheetGesture(
        () => state.setUiLangModalVisible(false),
        {
            animateOnOpen: shouldAnimateLanguageModalOpen,
            animateOnClose: shouldAnimateLanguageModalClose,
        },
    );

    const {
        invalidateProfileLoad,
        loadProfile,
        resetLocalEdits,
        travelerLangModalVisible,
        uiLangModalVisible,
    } = state;
    const { openSheet: openTravelerLanguageSheet } = travelerLanguageSheet;
    const { openSheet: openUiLanguageSheet } = uiLanguageSheet;

    useEffect(() => {
        void loadProfile();

        return () => {
            resetLocalEdits();
            invalidateProfileLoad();
        };
    }, [invalidateProfileLoad, loadProfile, resetLocalEdits]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'active') {
                void loadProfile();
            }
        });

        return () => {
            subscription.remove();
        };
    }, [loadProfile]);

    useEffect(() => {
        const timer = setInterval(() => {
            void loadProfile();
        }, PROFILE_HUB_REFRESH_INTERVAL_MS);

        return () => {
            clearInterval(timer);
        };
    }, [loadProfile]);

    useEffect(() => {
        if (travelerLangModalVisible) {
            openTravelerLanguageSheet();
        }
    }, [openTravelerLanguageSheet, travelerLangModalVisible]);

    useEffect(() => {
        if (uiLangModalVisible) {
            openUiLanguageSheet();
        }
    }, [openUiLanguageSheet, uiLangModalVisible]);

    return {
        state,
        travelerLanguageSheet,
        uiLanguageSheet,
    };
};
