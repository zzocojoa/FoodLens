import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useProfileHubState } from './useProfileHubState';
import { useModalSheetGesture } from './useModalSheetGesture';
import { ProfileHubControllerParams } from '../types';

const PROFILE_HUB_REFRESH_INTERVAL_MS = 15_000;

const isRefreshStale = (lastLoadedAtMs: number, refreshWindowMs: number): boolean => {
    if (lastLoadedAtMs <= 0) {
        return true;
    }

    return Date.now() - lastLoadedAtMs >= refreshWindowMs;
};

export const useProfileHubController = ({ userId, initialState }: ProfileHubControllerParams) => {
    const state = useProfileHubState(userId, initialState);
    const shouldAnimateLanguageModalOpen = Platform.OS !== 'android';
    const shouldAnimateLanguageModalClose = Platform.OS !== 'android';
    const shouldSkipNextFocusLoadRef = useRef(true);
    const lastLoadedAtRef = useRef(0);

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
    const loadProfileAndMarkFresh = useCallback(async () => {
        lastLoadedAtRef.current = Date.now();
        await loadProfile();
    }, [loadProfile]);
    const loadProfileIfStale = useCallback(() => {
        if (!isRefreshStale(lastLoadedAtRef.current, PROFILE_HUB_REFRESH_INTERVAL_MS)) {
            return;
        }

        void loadProfileAndMarkFresh();
    }, [loadProfileAndMarkFresh]);

    useEffect(() => {
        shouldSkipNextFocusLoadRef.current = true;
        void loadProfileAndMarkFresh();

        return () => {
            shouldSkipNextFocusLoadRef.current = true;
            lastLoadedAtRef.current = 0;
            resetLocalEdits();
            invalidateProfileLoad();
        };
    }, [invalidateProfileLoad, loadProfileAndMarkFresh, resetLocalEdits]);

    useFocusEffect(
        useCallback(() => {
            const subscription = AppState.addEventListener('change', (nextAppState) => {
                if (nextAppState === 'active') {
                    loadProfileIfStale();
                }
            });
            const timer = setInterval(() => {
                void loadProfileAndMarkFresh();
            }, PROFILE_HUB_REFRESH_INTERVAL_MS);

            if (shouldSkipNextFocusLoadRef.current) {
                shouldSkipNextFocusLoadRef.current = false;
                return () => {
                    subscription.remove();
                    clearInterval(timer);
                };
            }

            loadProfileIfStale();
            return () => {
                subscription.remove();
                clearInterval(timer);
            };
        }, [loadProfileAndMarkFresh, loadProfileIfStale]),
    );

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
