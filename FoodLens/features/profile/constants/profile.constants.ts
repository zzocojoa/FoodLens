import { AllergenOption } from '../types/profile.types';

export const TEST_UID = 'test-user-v1';
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
];
