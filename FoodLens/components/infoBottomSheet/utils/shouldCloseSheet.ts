import { SHEET_DISMISS_DISTANCE, SHEET_DISMISS_VELOCITY } from '../constants';

export const shouldCloseSheet = (translationY: number, velocityY: number): boolean =>
    translationY > SHEET_DISMISS_DISTANCE || velocityY > SHEET_DISMISS_VELOCITY;
