import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useProfileHubState } from './useProfileHubState';
import { useModalSheetGesture } from './useModalSheetGesture';
import { ProfileHubControllerParams } from '../types';

const PROFILE_HUB_REFRESH_INTERVAL_MS = 15_000;

export const useProfileHubController = ({ userId, initialState }: ProfileHubControllerParams) => {
    const state = useProfileHubState(userId, initialState);
    const shouldAnimateLanguageModalOpen = Platform.OS !== 'android';
    const shouldAnimateLanguageModalClose = Platform.OS !== 'android';
    const shouldSkipNextFocusLoadRef = useRef(true);

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
        shouldSkipNextFocusLoadRef.current = true;
        void loadProfile();

        return () => {
            shouldSkipNextFocusLoadRef.current = true;
            resetLocalEdits();
            invalidateProfileLoad();
        };
    }, [invalidateProfileLoad, loadProfile, resetLocalEdits]);

    useFocusEffect(
        useCallback(() => {
            if (shouldSkipNextFocusLoadRef.current) {
                shouldSkipNextFocusLoadRef.current = false;
                return undefined;
            }

            void loadProfile();
            return undefined;
        }, [loadProfile]),
    );

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
