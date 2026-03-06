import React from 'react';
import { Text, View } from 'react-native';
import { Globe } from 'lucide-react-native';
import { THEME } from '@/constants/theme';
import { useI18n } from '@/features/i18n';
import { TOTAL_COUNTRIES } from '../constants';
import { historyMapStyles as styles } from '../styles';
import { getVisitedPercentage } from '../utils/historyMapUtils';

const INSIGHT_ICON_COLOR = '#2563EB';

type HistoryMapOverlayProps = {
    isMapReady: boolean;
    countryCount: number;
    favoriteCountry: string;
    toastMessage: string | null;
};

export default function HistoryMapOverlay({
    isMapReady,
    countryCount,
    favoriteCountry,
    toastMessage,
}: HistoryMapOverlayProps) {
    const { t } = useI18n();
    if (!isMapReady || countryCount <= 0) {
        return toastMessage ? (
            <View style={styles.toastContainer}>
                <View style={[styles.toast, styles.toastBg]}>
                    <Text style={styles.toastText}>{toastMessage}</Text>
                </View>
            </View>
        ) : null;
    }

    const visitedCount = countryCount;
    const percentage = getVisitedPercentage(visitedCount, TOTAL_COUNTRIES);

    return (
        <>
            <View style={[styles.mapOverlay, THEME.shadow]}>
                <View style={[styles.insightCard, styles.insightCardBg]}>
                    <View style={styles.insightHeader}>
                        <View style={styles.insightIconBox}>
                            <Globe size={16} color={INSIGHT_ICON_COLOR} />
                        </View>
                        <Text style={styles.insightTitle}>{t('history.map.insights.title', 'Global Insights')}</Text>
                    </View>
                    <View style={styles.insightRow}>
                        <Text style={styles.insightLabel}>
                            {t('history.map.insights.favoriteDestination', 'Favorite Destination')}
                        </Text>
                        <Text style={styles.insightValue}>{favoriteCountry}</Text>
                    </View>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
                    </View>
                    <Text style={styles.insightHint}>
                        {t('history.map.insights.visitedTemplate', 'Visited {visited} of {total} countries')
                            .replace('{visited}', String(visitedCount))
                            .replace('{total}', String(TOTAL_COUNTRIES))}
                    </Text>
                </View>
            </View>

            {toastMessage && (
                <View style={styles.toastContainer}>
                    <View style={[styles.toast, styles.toastBg]}>
                        <Text style={styles.toastText}>{toastMessage}</Text>
                    </View>
                </View>
            )}
        </>
    );
}
