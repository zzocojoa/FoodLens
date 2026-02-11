import { CountryData } from '@/models/History';

export type CountryItemType = 'ok' | 'avoid' | 'ask' | undefined;

export type CountryListItem = CountryData['regions'][number]['items'][number] & {
    imageUri?: string;
};

export type CountryCardProps = {
    country: CountryData;
    countryIdx: number;
    isExpanded: boolean;
    onToggle: () => void;
    filter: string;
    matchesFilter: (type: string | undefined) => boolean;
    isAllowedItemType: (type: string | undefined) => boolean;
    isEditMode: boolean;
    selectedItems: Set<string>;
    onToggleItem: (id: string) => void;
    onDelete: (id: string) => void;
};

export type StatusMeta = {
    containerStyle: { backgroundColor: string; borderColor: string };
    kind: 'ok' | 'avoid' | 'ask';
};
