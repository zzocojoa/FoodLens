type AllergenTerms = Record<string, Record<string, string>>;

export const translateAllergenToKorean = (englishTerm: string, terms: AllergenTerms): string => {
    const key = englishTerm.trim();
    const dictKey = Object.keys(terms).find((k) => k.toLowerCase() === key.toLowerCase());

    if (dictKey && terms[dictKey]?.['KR']) {
        return terms[dictKey]?.['KR'];
    }

    return englishTerm;
};

