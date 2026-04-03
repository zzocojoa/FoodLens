import React from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAppNavigation } from '@/hooks/use-app-navigation';
import { useI18n } from '@/features/i18n';
import { openMailtoUrl } from '@/features/support/supportMail';
import { StatusBar } from 'expo-status-bar';
import Animated from 'react-native-reanimated';
import BreakdownOverlay from '@/components/BreakdownOverlay';
import { DateEditSheet } from '@/components/DateEditSheet';
import { ActionButtons } from '@/components/result/ActionButtons';
import { ResultContent } from '@/components/result/ResultContent';
import { ResultHeader } from '@/components/result/ResultHeader';
import { HEADER_HEIGHT } from '../constants/result.constants';
import { useResultScreen } from '../hooks/useResultScreen';
import { resultStyles as styles } from '../styles/resultStyles';
import ResultErrorState from '../components/ResultErrorState';
import ResultLoadingState from '../components/ResultLoadingState';
import ResultNavBar from '../components/ResultNavBar';
import ResultShareCard from '../components/ResultShareCard';
import {
    buildResultReportMailtoUrl,
    buildResultShareCardData,
    buildResultShareMessageData,
} from '../components/resultActionUtils';
import { shareResultCard } from '../components/resultShareTransport';

export default function ResultScreen() {
    const router = useRouter();
    const { back } = useAppNavigation();
    const { t, locale } = useI18n();
    const shareCardRef = React.useRef<View>(null);

    const {
        isRestoring,
        loaded,
        result,
        locationData,
        imageSource,
        timestamp,
        savedRecordId,
        reportSaveState,
        retryReportSave,
        isDateEditOpen,
        setIsDateEditOpen,
        handleDateUpdate,
        layoutStyle,
        scrollHandler,
        imageAnimatedStyle,
        headerOverlayStyle,
        isBreakdownOpen,
        openBreakdown,
        closeBreakdown,
        isError,
        errorInfo,
    } = useResultScreen();

    const handleShareResult = async () => {
        if (!result) {
            return;
        }

        const shareMessageData = buildResultShareMessageData({
            result,
            locationData,
            timestamp,
            locale,
            t,
        });

        try {
            await shareResultCard({
                viewRef: shareCardRef,
                dialogTitle: shareMessageData.title,
                message: shareMessageData.message,
                shareTitle: shareMessageData.title,
            });
        } catch (error) {
            const messageText =
                error instanceof Error
                    ? error.message
                    : t('result.share.error', 'Could not open the share sheet.');
            Alert.alert(t('result.share.errorTitle', 'Share failed'), messageText);
        }
    };

    const handleReportIncorrectResult = async () => {
        if (!result) {
            return;
        }

        if (reportSaveState === 'saving') {
            Alert.alert(
                t('result.report.pendingTitle', 'Saving analysis'),
                t(
                    'result.report.pendingMessage',
                    'We are still saving this result. Please try reporting again in a moment.'
                )
            );
            return;
        }

        if (reportSaveState === 'failed') {
            retryReportSave();
            Alert.alert(
                t('result.report.retryTitle', 'Save failed'),
                t(
                    'result.report.retryMessage',
                    'We could not finish saving this result. We are trying again now. Please report again in a moment.'
                )
            );
            return;
        }

        const mailtoUrl = buildResultReportMailtoUrl({
            result,
            locationData,
            timestamp,
            locale,
            t,
            savedRecordId,
        });

        try {
            await openMailtoUrl(mailtoUrl);
        } catch (error) {
            const messageText =
                error instanceof Error
                    ? error.message
                    : t(
                          'result.report.contactFallback',
                          'Unable to open your email app. Please contact support manually.',
                      );
            Alert.alert(t('result.report.errorTitle', 'Support unavailable'), messageText);
        }
    };

    React.useEffect(() => {
        if (!__DEV__) return;
        console.log('[ResultScreenTrace] constants', {
            HEADER_HEIGHT,
        });
    }, []);

    if (isRestoring || (!loaded && !result)) {
        return <ResultLoadingState isRestoring={isRestoring} t={t} />;
    }

    if (!result) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={{ color: '#94A3B8', marginBottom: 16 }}>
                    {t('result.empty.noData', 'No analysis data found.')}
                </Text>
                <TouchableOpacity
                    style={{
                        backgroundColor: '#2563EB',
                        paddingHorizontal: 18,
                        paddingVertical: 12,
                        borderRadius: 10,
                        marginBottom: 10,
                    }}
                    onPress={() => router.replace('/scan/camera')}
                >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                        {t('result.empty.startScan', 'Start Scan')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
                    <Text style={{ color: '#64748B', fontWeight: '600' }}>
                        {t('result.empty.backHome', 'Back to Home')}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (isError && errorInfo) {
        return (
            <ResultErrorState
                imageSource={imageSource}
                locationData={locationData}
                errorInfo={errorInfo}
                t={t}
            />
        );
    }

    const shareCardData = buildResultShareCardData({
        result,
        locationData,
        timestamp,
        locale,
        t,
    });

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />

            <ResultHeader
                imageSource={imageSource}
                imageAnimatedStyle={imageAnimatedStyle}
                headerOverlayStyle={headerOverlayStyle}
                layoutStyle={layoutStyle}
                isBarcode={result?.isBarcode}
            />

            <ResultNavBar
                onBack={back}
                onShare={handleShareResult}
                onReport={handleReportIncorrectResult}
                shareAccessibilityLabel={t('result.action.share', 'Share')}
                reportAccessibilityLabel={t('result.action.reportIncorrect', 'Report')}
            />

            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: HEADER_HEIGHT - 160 }}
                showsVerticalScrollIndicator={false}
            >
                <ResultContent
                    result={result}
                    locationData={locationData}
                    imageSource={imageSource}
                    timestamp={timestamp}
                    onOpenBreakdown={openBreakdown}
                    onDatePress={() => setIsDateEditOpen(true)}
                    t={t}
                    locale={locale}
                />
            </Animated.ScrollView>

            <DateEditSheet
                isVisible={isDateEditOpen}
                initialDate={timestamp ? new Date(timestamp) : new Date()}
                onClose={() => setIsDateEditOpen(false)}
                onConfirm={handleDateUpdate}
                locale={locale}
                t={t}
            />

            <BreakdownOverlay
                isOpen={isBreakdownOpen}
                onClose={closeBreakdown}
                resultData={result}
                t={t}
            />

            <ActionButtons t={t} />

            <View pointerEvents="none" style={styles.shareCardCaptureContainer}>
                <View ref={shareCardRef} collapsable={false} style={styles.shareCardCaptureFrame}>
                    <ResultShareCard
                        brandLabel={shareCardData.brandLabel}
                        foodName={shareCardData.foodName}
                        safetyLabel={shareCardData.safetyLabel}
                        reasonTitle={shareCardData.reasonTitle}
                        actionTitle={shareCardData.actionTitle}
                        reasons={shareCardData.reasons}
                        actionLine={shareCardData.actionLine}
                        disclaimer={shareCardData.disclaimer}
                        imageSource={imageSource}
                        locationLabel={shareCardData.locationLabel}
                        placeholderLabel={shareCardData.placeholderLabel}
                        themeVariant={shareCardData.themeVariant}
                    />
                </View>
            </View>
        </View>
    );
}
