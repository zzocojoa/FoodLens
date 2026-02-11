export const countSafeAnalysesFromStart = (
    analyses: Array<{ timestamp: string | Date; safetyStatus: string }>,
    startTime: number
): number =>
    analyses.filter((item) => new Date(item.timestamp).getTime() >= startTime && item.safetyStatus === 'SAFE').length;

export const countSafeAnalysesTotal = (
    analyses: Array<{ safetyStatus: string }>
): number => analyses.filter((item) => item.safetyStatus === 'SAFE').length;

export const buildLocationLabel = (
    place: { city?: string | null; region?: string | null; country?: string | null } | null | undefined,
    fallback: string
): string => {
    if (!place) return fallback;

    const first = place.city || place.region || '';
    const second = place.country || '';
    let value = `${first}, ${second}`;

    if (value.startsWith(', ')) value = value.substring(2);
    if (value.endsWith(', ')) value = value.substring(0, value.length - 2);

    return value || fallback;
};
