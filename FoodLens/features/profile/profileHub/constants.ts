import { LanguageOption } from './types';

export const DEFAULT_NAME = 'Traveler Joy';
export const DEFAULT_IMAGE = 'https://api.dicebear.com/7.x/avataaars/png?seed=Felix';

export const LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: 'auto', label: 'Auto (Photo/GPS)', flag: '📍' },
    { code: 'ko-KR', label: 'Korean', flag: '🇰🇷' },
    { code: 'en-US', label: 'English', flag: '🇺🇸' },
    { code: 'ja-JP', label: 'Japanese', flag: '🇯🇵' },
    { code: 'zh-Hans', label: 'Chinese', flag: '🇨🇳' },
    { code: 'th-TH', label: 'Thai', flag: '🇹🇭' },
    { code: 'vi-VN', label: 'Vietnamese', flag: '🇻🇳' },
];

export const UI_LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: 'auto', label: 'Auto (Device)', flag: '📱' },
    { code: 'ko-KR', label: 'Korean', flag: '🇰🇷' },
    { code: 'en-US', label: 'English', flag: '🇺🇸' },
];
