import React from 'react';
import { View } from 'react-native';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import { ENABLE_MAP_CLUSTERING, INITIAL_REGION } from './historyMap/constants';
import HistoryMapMarkers from './historyMap/components/HistoryMapMarkers';
import HistoryMapOverlay from './historyMap/components/HistoryMapOverlay';
import HistoryMapStatusLayers from './historyMap/components/HistoryMapStatusLayers';
import { useHistoryMapState } from './historyMap/hooks/useHistoryMapState';
import { historyMapStyles as styles } from './historyMap/styles';
import { HistoryMapProps } from './historyMap/types';

export default function HistoryMap({ data, initialRegion, onMarkerPress, onReady, onRegionChange }: HistoryMapProps) {
    const {
        mapRef,
        mapReloadKey,
        isMapReady,
        isMapError,
        errorType,
        toastMessage,
        favoriteCountry,
        markers,
        visibleMarkers,
        visibleClusteredItems,
        handleRetry,
        handleOpenSettings,
        handleRegionChangeComplete,
        handleClusterPress,
        handleMapReady,
    } = useHistoryMapState({ data, initialRegion, onReady, onRegionChange });

    return (
        <View style={styles.mapContainer}>
            <HistoryMapStatusLayers
                isMapError={isMapError}
                isMapReady={isMapReady}
                markersLength={markers.length}
                errorType={errorType}
                onRetry={handleRetry}
                onOpenSettings={handleOpenSettings}
            />

            <MapView
                key={mapReloadKey}
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_DEFAULT}
                initialRegion={initialRegion || INITIAL_REGION}
                onMapReady={handleMapReady}
                onRegionChangeComplete={handleRegionChangeComplete}
                maxZoomLevel={20}
                minZoomLevel={1}
            >
                <HistoryMapMarkers
                    markers={markers}
                    visibleMarkers={visibleMarkers}
                    visibleClusteredItems={visibleClusteredItems}
                    onMarkerPress={onMarkerPress}
                    onClusterPress={handleClusterPress}
                />
            </MapView>

            <HistoryMapOverlay
                isMapReady={isMapReady}
                countryCount={data.length}
                favoriteCountry={favoriteCountry}
                toastMessage={toastMessage}
            />
        </View>
    );
}
