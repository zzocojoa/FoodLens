import { useEffect, useState } from 'react';
import { UserService } from '../../../services/userService';
import { TEST_UID } from '../constants/allergies.constants';
import { mergeAllergyTerms } from '../utils/mergeAllergyTerms';
import { AllergiesState } from '../types/allergies.types';

export const useAllergiesData = (): AllergiesState => {
    const [allergies, setAllergies] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const loadAllergies = async () => {
            try {
                const profile = await UserService.getUserProfile(TEST_UID);
                if (!mounted || !profile) return;

                const combined = mergeAllergyTerms(
                    profile.safetyProfile.allergies,
                    profile.safetyProfile.dietaryRestrictions
                );
                setAllergies(combined);
            } catch (e) {
                console.error('Failed to load allergies', e);
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        loadAllergies();

        return () => {
            mounted = false;
        };
    }, []);

    return { allergies, loading };
};

