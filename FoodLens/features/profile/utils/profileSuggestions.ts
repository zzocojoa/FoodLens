export const buildSuggestions = (
    keyword: string,
    searchable: string[],
    selected: string[],
    limit = 5
): string[] => {
    const query = keyword.trim().toLowerCase();
    if (!query) return [];

    return searchable
        .filter((item) => item.toLowerCase().includes(query) && !selected.includes(item))
        .slice(0, limit);
};

