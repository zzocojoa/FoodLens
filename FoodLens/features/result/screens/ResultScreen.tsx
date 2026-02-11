import React from 'react';
import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
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

    const {
        isRestoring,
        loaded,
        result,
        locationData,
        imageSource,
        rawImageUri,
        displayImageUri,
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
        setIsBreakdownOpen,
        isError,
        errorInfo,
    } = useResultScreen();

    if (isRestoring || (!loaded && !result)) {
        return <ResultLoadingState isRestoring={isRestoring} />;
    }

    if (!result) {
        return (
            <View style={styles.loadingContainer}>
                <Text>No Data</Text>
            </View>
        );
    }

    if (isError && errorInfo) {
        return (
            <ResultErrorState
                imageSource={imageSource}
                locationData={locationData}
                rawImageUri={rawImageUri}
                displayImageUri={displayImageUri}
                errorInfo={errorInfo}
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
            />

            <ResultNavBar onBack={() => router.back()} />

            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: HEADER_HEIGHT - 160 }}
                showsVerticalScrollIndicator={false}
            >
                <ResultContent
                    result={result}
                    locationData={locationData}
                    timestamp={timestamp}
                    onOpenBreakdown={() => setIsBreakdownOpen(true)}
                    onDatePress={() => setIsDateEditOpen(true)}
                />
            </Animated.ScrollView>

            <DateEditSheet
                isVisible={isDateEditOpen}
                initialDate={timestamp ? new Date(timestamp) : new Date()}
                onClose={() => setIsDateEditOpen(false)}
                onConfirm={handleDateUpdate}
            />

            <BreakdownOverlay
                isOpen={isBreakdownOpen}
                onClose={() => setIsBreakdownOpen(false)}
                resultData={result}
            />

            <ActionButtons />
        </View>
    );
}
