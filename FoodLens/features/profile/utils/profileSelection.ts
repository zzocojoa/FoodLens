export const toggleStringItem = (source: string[], item: string): string[] => {
    if (source.includes(item)) return source.filter((v) => v !== item);
    return [...source, item];
};

export const addUniqueItem = (source: string[], text: string): string[] => {
    const item = text.trim();
    if (!item || source.includes(item)) return source;
    return [...source, item];
};

export const removeStringItem = (source: string[], item: string): string[] =>
    source.filter((v) => v !== item);

