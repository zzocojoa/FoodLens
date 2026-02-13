export type NullableText = string | null;

export type LocationData = {
  latitude: number;
  longitude: number;
  country: NullableText;
  city: NullableText;
  district: string;
  subregion: string;
  isoCountryCode?: string;
  formattedAddress: string;
};
