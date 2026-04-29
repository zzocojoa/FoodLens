import React from 'react';
import type { Region } from 'react-native-maps';

import type { CountryData } from '@/models/History';
import HistoryMap from '@/components/HistoryMap';

import HistoryAtlasUnavailableCard from './HistoryAtlasUnavailableCard';
import type { HistoryDashboardColors } from './historyDashboardTokens';

type HistoryAtlasPanelProps = {
  canRenderNativeMap: boolean;
  colors: HistoryDashboardColors;
  data: CountryData[];
  initialRegion: Region | null;
  onMarkerPress: (id: string) => void;
  onRegionChange: (region: Region) => void;
};

export default function HistoryAtlasPanel({
  canRenderNativeMap,
  colors,
  data,
  initialRegion,
  onMarkerPress,
  onRegionChange,
}: HistoryAtlasPanelProps): React.JSX.Element {
  if (!canRenderNativeMap) {
    return <HistoryAtlasUnavailableCard colors={colors} />;
  }

  return (
    <HistoryMap
      data={data}
      colors={colors}
      initialRegion={initialRegion}
      onMarkerPress={onMarkerPress}
      onRegionChange={onRegionChange}
    />
  );
}
