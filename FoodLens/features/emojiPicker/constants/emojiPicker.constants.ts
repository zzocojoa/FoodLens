import { getCurrentUserId } from '@/services/auth/currentUser_Logic';

export const getEmojiPickerUserId = (): string => getCurrentUserId();
export const DEFAULT_EMOJI = '🍎';

export const EMOJI_OPTIONS = [
    '🍎',
    '🍏',
    '🍊',
    '🍋',
    '🍇',
    '🍓',
    '🥝',
    '🥑',
    '🍑',
    '🍒',
    '🫐',
    '🍌',
    '🍉',
    '🥭',
    '🍐',
    '🍈',
    '🫒',
    '🥥',
] as const;
