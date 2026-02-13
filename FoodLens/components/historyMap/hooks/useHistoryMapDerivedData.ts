import { useMemo } from 'react';
import { Region } from 'react-native-maps';
import Supercluster from 'supercluster';
import { HistoryMapProps, ClusterOrPoint } from '../types';
import {
  CLUSTER_MAX_ZOOM,
  CLUSTER_MIN_ZOOM,
  CLUSTER_RADIUS,
  ENABLE_MAP_CLUSTERING,
  MAX_RENDER_MARKERS,
} from '../constants';
import {
  debugLog,
  flattenMarkers,
  getFavoriteCountry,
  toApproxZoom,
  toBoundingBox,
  toMarkerFeatures,
} from '../utils/historyMapUtils';

type UseHistoryMapDerivedDataParams = {
  data: HistoryMapProps['data'];
  activeRegion: Region;
};

export const useHistoryMapDerivedData = ({ data, activeRegion }: UseHistoryMapDerivedDataParams) => {
  const markers = useMemo(() => {
    const nextMarkers = flattenMarkers(data);
    debugLog(`[MAP_DEBUG] Markers computed: ${nextMarkers.length} total`);
    return nextMarkers;
  }, [data]);

  const visibleMarkers = useMemo(
    () => (markers.length > MAX_RENDER_MARKERS ? markers.slice(0, MAX_RENDER_MARKERS) : markers),
    [markers]
  );

  const isMarkerCapped = markers.length > visibleMarkers.length;
  const markerFeatures = useMemo(() => toMarkerFeatures(markers), [markers]);

  const supercluster = useMemo(() => {
    if (!ENABLE_MAP_CLUSTERING) return null;
    const index = new Supercluster({
      radius: CLUSTER_RADIUS,
      maxZoom: CLUSTER_MAX_ZOOM,
      minZoom: CLUSTER_MIN_ZOOM,
    });
    index.load(markerFeatures);
    return index;
  }, [markerFeatures]);

  const clusteredItems = useMemo<ClusterOrPoint[]>(() => {
    if (!ENABLE_MAP_CLUSTERING || !supercluster) return [];
    const bbox = toBoundingBox(activeRegion);
    const zoom = toApproxZoom(activeRegion);
    return supercluster.getClusters(bbox, zoom) as unknown as ClusterOrPoint[];
  }, [activeRegion, supercluster]);

  const visibleClusteredItems = useMemo(
    () =>
      clusteredItems.length > MAX_RENDER_MARKERS
        ? clusteredItems.slice(0, MAX_RENDER_MARKERS)
        : clusteredItems,
    [clusteredItems]
  );

  const isClusteredCapped = clusteredItems.length > visibleClusteredItems.length;
  const renderedItemCount = ENABLE_MAP_CLUSTERING ? visibleClusteredItems.length : visibleMarkers.length;
  const favoriteCountry = useMemo(() => getFavoriteCountry(data), [data]);

  return {
    markers,
    visibleMarkers,
    isMarkerCapped,
    clusteredItems,
    visibleClusteredItems,
    isClusteredCapped,
    renderedItemCount,
    favoriteCountry,
  };
};
