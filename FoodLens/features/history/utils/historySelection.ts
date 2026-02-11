export const toggleInSet = (source: Set<string>, id: string): Set<string> => {
    const next = new Set(source);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
};

export const toggleCountryExpanded = (source: Set<string>, countryName: string): Set<string> => {
    const next = new Set(source);
    if (next.has(countryName)) next.delete(countryName);
    else next.add(countryName);
    return next;
};

