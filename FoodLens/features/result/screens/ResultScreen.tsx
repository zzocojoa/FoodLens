import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAppNavigation } from '@/hooks/use-app-navigation';
import { useI18n } from '@/features/i18n';
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

export default function ResultScreen() {
    const router = useRouter();
    const { back } = useAppNavigation();
    const { t, locale } = useI18n();

    const {
        isRestoring,
        loaded,
        result,
        locationData,
        imageSource,
        timestamp,
        isDateEditOpen,
        setIsDateEditOpen,
        handleDateUpdate,
        pins,
        layoutStyle,
        scrollY,
        scrollHandler,
        imageAnimatedStyle,
        headerOverlayStyle,
        isBreakdownOpen,
        openBreakdown,
        closeBreakdown,
        isError,
        errorInfo,
    } = useResultScreen();

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
                <TouchableOpacity onPress={() => router.replace('/')}>
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

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />

            <ResultHeader
                imageSource={imageSource}
                imageAnimatedStyle={imageAnimatedStyle}
                headerOverlayStyle={headerOverlayStyle}
                pins={pins}
                scrollY={scrollY}
                layoutStyle={layoutStyle}
                isBarcode={result?.isBarcode}
            />

            <ResultNavBar onBack={back} />

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
        </View>
    );
}
