export const mergeAllergyTerms = (allergies: string[], dietaryRestrictions: string[]): string[] => {
    return [...allergies, ...dietaryRestrictions];
};

