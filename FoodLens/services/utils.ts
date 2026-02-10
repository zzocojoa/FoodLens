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
 * Fetches current location and geocoded country/city data with detailed address
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
            3000 // 3 seconds timeout
        );
        
        if (!locationResult) return null;
        
        const { latitude, longitude } = locationResult.coords;
        
        let country: string | null = null;
        let city: string | null = null;
        let district = "";      // 구/군 (e.g., 남구)
        let subregion = "";     // 동/읍/면 (e.g., 무거동)
        let street = "";        // 도로명/번지
        let isoCountryCode: string | undefined = undefined;
        let formattedAddress = "";

        try {
            const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (reverseGeocode.length > 0) {
                const place = reverseGeocode[0];
                
                // Extract all available fields
                country = place.country || null;
                city = place.city || place.region || null;
                district = place.district || place.subregion || "";  // 구/군
                subregion = place.name || place.street || "";       // 동/도로명
                street = place.streetNumber ? `${place.street} ${place.streetNumber}` : (place.street || "");
                isoCountryCode = place.isoCountryCode || undefined;
                
                // Build formatted address (most specific to least specific)
                // e.g., "무거동, 남구, 울산광역시, 대한민국"
                const addressParts = [
                    subregion,
                    district,
                    city,
                    country
                ].filter(part => part && part !== city && part !== country || part === city || part === country);
                
                // Remove duplicates while preserving order
                const uniqueParts: string[] = [];
                addressParts.forEach(part => {
                    if (part && !uniqueParts.includes(part)) {
                        uniqueParts.push(part);
                    }
                });
                
                formattedAddress = uniqueParts.join(', ');
            }
        } catch (e) {
            console.warn("Reverse geocode failed", e);
        }
        
        return { 
            latitude, 
            longitude, 
            country, 
            city, 
            district,
            subregion,
            isoCountryCode,
            formattedAddress  // e.g., "무거동, 남구, 울산광역시, 대한민국"
        };
    } catch (e) {
        console.error("getLocationData failed", e);
        return null;
    }
};

/**
 * Validates latitude and longitude coordinates
 */
export const validateCoordinates = (lat: any, lng: any): { latitude: number, longitude: number } | null => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (isNaN(latitude) || isNaN(longitude)) return null;

  // Simple range check
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
};

/**
 * Converts decimal coordinates to DMS (Degrees, Minutes, Seconds) format for EXIF
 * Returns [[deg, 1], [min, 1], [sec, 100]]
 */
export const decimalToDMS = (coordinate: number): [[number, number], [number, number], [number, number]] => {
  const absolute = Math.abs(coordinate);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = Math.floor((minutesNotTruncated - minutes) * 60 * 100);

  return [[degrees, 1], [minutes, 1], [seconds, 100]];
};

/**
 * Normalizes various date string formats (especially EXIF) to ISO 8601
 * 
 * EXIF: "YYYY:MM:DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS"
 * ISO: "YYYY-MM-DDTHH:MM:SS.sssZ" -> Returns as is
 * empty/null -> Returns current time ISO
 */
export const normalizeTimestamp = (dateString?: string | null): string => {
    if (!dateString) return new Date().toISOString();
    
    // Trim
    let cleanTs = dateString.trim();
    
    // 0. Check if already ISO-like or valid date
    // (Contains Hyphens and usually T, or just valid string)
    // But be careful: "2023:01:01" is invalid for Date() in some engines if not replaced
    if (cleanTs.includes('-') && cleanTs.includes('T')) {
         const parsed = new Date(cleanTs);
         if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }

    // 1. Try generic digit extraction for EXIF-like patterns
    // Matches YYYY:MM:DD HH:MM:SS or YYYY/MM/DD or YYYY-MM-DD
    // We look for 6 groups of digits
    const digits = cleanTs.match(/(\d{4})[:\/\-](\d{2})[:\/\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    
    if (digits && digits.length >= 7) {
        const year = digits[1];
        const month = digits[2];
        const day = digits[3];
        const hour = digits[4];
        const minute = digits[5];
        const second = digits[6];
        
        // Reconstruct as ISO compatible string (Local time interpretation)
        // new Date("YYYY-MM-DDTHH:MM:SS")
        const isoLike = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        const parsed = new Date(isoLike);
        
        if (!isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }
    }
    
    // 2. Fallback: Try straight parsing
    const fallbackParse = new Date(cleanTs);
    if (!isNaN(fallbackParse.getTime())) {
        return fallbackParse.toISOString();
    }
    
    // 3. Last Resort
    console.warn("normalizeTimestamp: failed to parse", dateString);
    return new Date().toISOString();
};
