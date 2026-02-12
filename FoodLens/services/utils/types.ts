export type LocationData = {
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
  district: string;
  subregion: string;
  isoCountryCode?: string;
  formattedAddress: string;
};

