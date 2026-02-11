import React from 'react';
import { BlurView } from 'expo-blur';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import CountryCardHeader from './countryCard/components/CountryCardHeader';
import CountryRegionList from './countryCard/components/CountryRegionList';
import { useSwipeableRegistry } from './countryCard/hooks/useSwipeableRegistry';
import { countryCardStyles as styles } from './countryCard/styles';
import { CountryCardProps } from './countryCard/types';

export default function CountryCard({
    country,
    countryIdx,
    isExpanded,
    onToggle,
    filter,
    matchesFilter,
    isAllowedItemType,
    isEditMode,
    selectedItems,
    onToggleItem,
    onDelete,
}: CountryCardProps) {
    void countryIdx;

    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { setSwipeableRef } = useSwipeableRegistry(isEditMode);

    return (
        <BlurView
            intensity={isExpanded ? 90 : 70}
            tint={colorScheme === 'dark' ? 'dark' : 'light'}
            style={[
                styles.countryCard,
                { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                isExpanded && { borderColor: theme.primary, borderWidth: 1.5 },
            ]}
        >
            <CountryCardHeader
                flag={country.flag}
                countryName={country.country}
                total={country.total}
                isExpanded={isExpanded}
                onToggle={onToggle}
                colorScheme={colorScheme}
            />

            {isExpanded && (
                <CountryRegionList
                    country={country}
                    filter={filter}
                    matchesFilter={matchesFilter}
                    isAllowedItemType={isAllowedItemType}
                    isEditMode={isEditMode}
                    selectedItems={selectedItems}
                    onToggleItem={onToggleItem}
                    onDelete={onDelete}
                    setSwipeableRef={setSwipeableRef}
                    colorScheme={colorScheme}
                />
            )}
        </BlurView>
    );
}
