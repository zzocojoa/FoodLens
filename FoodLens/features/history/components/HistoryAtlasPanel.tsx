import React from 'react';
import type { Region } from 'react-native-maps';

import type { CountryData } from '@/models/History';
import HistoryMap from '@/components/HistoryMap';

import HistoryAtlasUnavailableCard from './HistoryAtlasUnavailableCard';

type HistoryAtlasPanelProps = {
  canRenderNativeMap: boolean;
  data: CountryData[];
  initialRegion: Region | null;
  onMarkerPress: (id: string) => void;
  onRegionChange: (region: Region) => void;
};

export default function HistoryAtlasPanel({
  canRenderNativeMap,
  data,
  initialRegion,
  onMarkerPress,
  onRegionChange,
}: HistoryAtlasPanelProps): React.JSX.Element {
  if (!canRenderNativeMap) {
    return <HistoryAtlasUnavailableCard />;
  }

  return (
    <HistoryMap
      data={data}
      initialRegion={initialRegion}
      onMarkerPress={onMarkerPress}
      onRegionChange={onRegionChange}
    />
  );
}
