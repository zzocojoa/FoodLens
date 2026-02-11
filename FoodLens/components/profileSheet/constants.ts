import { LanguageOption } from './types';

export const DEFAULT_NAME = 'Traveler Joy';
export const DEFAULT_IMAGE = 'https://api.dicebear.com/7.x/avataaars/png?seed=Felix';

export const LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: 'GPS', label: 'GPS Location', flag: '📍' },
    { code: 'KR', label: 'Korean', flag: '🇰🇷' },
    { code: 'US', label: 'English', flag: '🇺🇸' },
    { code: 'JP', label: 'Japanese', flag: '🇯🇵' },
    { code: 'CN', label: 'Chinese', flag: '🇨🇳' },
    { code: 'TH', label: 'Thai', flag: '🇹🇭' },
    { code: 'VN', label: 'Vietnamese', flag: '🇻🇳' },
];
