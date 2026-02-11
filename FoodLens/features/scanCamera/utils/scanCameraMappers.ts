export const createFallbackLocation = (
    lat: number,
    lng: number,
    isoCode?: string,
    address: string = ''
) => ({
    latitude: lat,
    longitude: lng,
    country: null,
    city: null,
    district: '',
    subregion: '',
    isoCountryCode: isoCode,
    formattedAddress: address,
});

