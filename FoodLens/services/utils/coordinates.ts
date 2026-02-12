/**
 * Validates latitude and longitude coordinates.
 */
export const validateCoordinates = (
  lat: unknown,
  lng: unknown,
): { latitude: number; longitude: number } | null => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (isNaN(latitude) || isNaN(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
};

/**
 * Converts decimal coordinates to DMS format for EXIF.
 * Returns [[deg, 1], [min, 1], [sec, 100]]
 */
export const decimalToDMS = (
  coordinate: number,
): [[number, number], [number, number], [number, number]] => {
  const absolute = Math.abs(coordinate);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = Math.floor((minutesNotTruncated - minutes) * 60 * 100);

  return [
    [degrees, 1],
    [minutes, 1],
    [seconds, 100],
  ];
};

