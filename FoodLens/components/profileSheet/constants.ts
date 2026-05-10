import { LanguageOption } from './types';

export const DEFAULT_NAME = 'Traveler Joy';
export const DEFAULT_IMAGE = 'https://api.dicebear.com/7.x/avataaars/png?seed=Felix';

type LanguageOptionSeed = Omit<LanguageOption, 'label'>;

export const LANGUAGE_OPTIONS: LanguageOptionSeed[] = [
    { code: 'auto', flag: '📍' },
    { code: 'ko-KR', flag: '🇰🇷' },
    { code: 'en-US', flag: '🇺🇸' },
    { code: 'ja-JP', flag: '🇯🇵' },
    { code: 'zh-Hans', flag: '🇨🇳' },
    { code: 'th-TH', flag: '🇹🇭' },
    { code: 'vi-VN', flag: '🇻🇳' },
    { code: 'fr-FR', flag: '🇫🇷' },
];

export const UI_LANGUAGE_OPTIONS: LanguageOptionSeed[] = [
    { code: 'auto', flag: '📱' },
    { code: 'ko-KR', flag: '🇰🇷' },
    { code: 'en-US', flag: '🇺🇸' },
];
