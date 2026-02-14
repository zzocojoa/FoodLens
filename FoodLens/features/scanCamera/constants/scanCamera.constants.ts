import { ScanCameraModeOption } from '../types/scanCamera.types';
import { CURRENT_USER_ID } from '@/services/auth/currentUser';

export const TEST_UID = CURRENT_USER_ID;

export const MODES: ScanCameraModeOption[] = [
    { id: 'LABEL', label: '라벨' },
    { id: 'FOOD', label: '사진' },
    { id: 'BARCODE', label: '바코드' },
];
