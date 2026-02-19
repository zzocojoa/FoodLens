import { AllergenOption, AllergySeverity, Gender } from '../types/profile.types';
import { getCurrentUserId } from '@/services/auth/currentUser';

export const getProfileUserId = (): string => getCurrentUserId();
export const TEST_EMAIL = 'test@example.com';

const ALLERGEN_IMAGES = {
    egg: require('../../../assets/images/allergens/egg.png'),
    milk: require('../../../assets/images/allergens/milk.png'),
    peanut: require('../../../assets/images/allergens/peanut.png'),
    shellfish: require('../../../assets/images/allergens/shellfish.png'),
    wheat: require('../../../assets/images/allergens/wheat.png'),
    soy: require('../../../assets/images/allergens/soy.png'),
    treenut: require('../../../assets/images/allergens/treenut.png'),
    fish: require('../../../assets/images/allergens/fish.png'),
    sesame: require('../../../assets/images/allergens/sesame.png'),
};

export const COMMON_ALLERGENS: AllergenOption[] = [
    { id: 'egg', label: 'Eggs', image: ALLERGEN_IMAGES.egg },
    { id: 'milk', label: 'Milk', image: ALLERGEN_IMAGES.milk },
    { id: 'peanut', label: 'Peanuts', image: ALLERGEN_IMAGES.peanut },
    { id: 'shellfish', label: 'Shellfish', image: ALLERGEN_IMAGES.shellfish },
    { id: 'wheat', label: 'Wheat', image: ALLERGEN_IMAGES.wheat },
    { id: 'soy', label: 'Soy', image: ALLERGEN_IMAGES.soy },
    { id: 'treenut', label: 'Tree Nuts', image: ALLERGEN_IMAGES.treenut },
    { id: 'fish', label: 'Fish', image: ALLERGEN_IMAGES.fish },
    { id: 'sesame', label: 'Sesame', image: ALLERGEN_IMAGES.sesame },
];

export const SEVERITY_LEVELS: { key: AllergySeverity; label: string; emoji: string; color: string }[] = [
    { key: 'mild', label: 'Mild', emoji: '⚠️', color: '#F59E0B' },
    { key: 'moderate', label: 'Moderate', emoji: '🔶', color: '#F97316' },
    { key: 'severe', label: 'Severe', emoji: '🔴', color: '#EF4444' },
];

export const GENDER_OPTIONS: { key: Gender; label: string; icon: string }[] = [
    { key: 'male', label: 'Male', icon: '👨' },
    { key: 'female', label: 'Female', icon: '👩' },
];
