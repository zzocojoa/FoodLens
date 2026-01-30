import * as Location from 'expo-location';

/**
 * Shared utility functions for FoodLens
 */

/**
 * Maps food names to relevant emojis
 */
export const getEmoji = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('noodle') || n.includes('pad')) return '🍜';
  if (n.includes('rice')) return '🍚';
  if (n.includes('burger')) return '🍔';
  if (n.includes('pizza')) return '🍕';
  if (n.includes('salad')) return '🥗';
  if (n.includes('fruit')) return '🍎';
  if (n.includes('cake') || n.includes('gelato')) return '🍰';
  return '🍽️';
};

/**
 * Formats dates into user-friendly strings (e.g., "Just now", "5m ago")
 */
export const formatDate = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
};

/**
 * Timeout helper for promises
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<T | null>((resolve) =>
      setTimeout(() => resolve(null), ms)
    )
  ]);
}

/**
 * Fetches current location and geocoded country/city data
 */
export const getLocationData = async () => {
    try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
            const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
            if (newStatus !== 'granted') return null;
        }
        
        const locationResult = await withTimeout(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            5000 // 5 seconds timeout
        );
        
        if (!locationResult) return null;
        
        const { latitude, longitude } = locationResult.coords;
        
        let country = "Unknown";
        let city = "Unknown";
        let isoCountryCode = undefined;

        try {
            const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (reverseGeocode.length > 0) {
                const place = reverseGeocode[0];
                country = place.country || "Unknown";
                city = place.city || place.region || "Unknown";
                isoCountryCode = place.isoCountryCode || undefined;
            }
        } catch (e) {
            console.warn("Reverse geocode failed", e);
        }
        
        return { latitude, longitude, country, city, isoCountryCode };
    } catch (e) {
        console.error("getLocationData failed", e);
        return null;
    }
};
