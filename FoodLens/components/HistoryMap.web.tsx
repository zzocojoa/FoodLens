import React from 'react';
import { Text, View } from 'react-native';
import type { CountryData } from '@/models/History';

type HistoryMapProps = {
  data: CountryData[];
  initialRegion: unknown;
  onMarkerPress: (countryId: string) => void;
  onReady?: () => void;
  onRegionChange?: (region: unknown) => void;
};

const containerStyle = {
  flex: 1,
  minHeight: 280,
  borderRadius: 24,
  marginHorizontal: 20,
  marginBottom: 20,
  paddingHorizontal: 20,
  paddingVertical: 24,
  backgroundColor: '#F8FAFC',
  borderWidth: 1,
  borderColor: '#E2E8F0',
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  gap: 8,
};

const titleStyle = {
  color: '#0F172A',
  fontSize: 18,
  fontWeight: '700' as const,
  textAlign: 'center' as const,
};

const descriptionStyle = {
  color: '#475569',
  fontSize: 14,
  lineHeight: 20,
  textAlign: 'center' as const,
};

export default function HistoryMap({
  data,
  initialRegion,
  onMarkerPress,
  onReady,
  onRegionChange,
}: HistoryMapProps) {
  void initialRegion;
  void onMarkerPress;
  void onRegionChange;

  React.useEffect(() => {
    if (onReady) {
      onReady();
    }
  }, [onReady]);

  return (
    <View style={containerStyle}>
      <Text style={titleStyle}>Map unavailable on web</Text>
      <Text style={descriptionStyle}>
        {`FoodLens history map requires native map rendering. ${data.length} countries are available in list mode.`}
      </Text>
    </View>
  );
}
