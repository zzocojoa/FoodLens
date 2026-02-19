import { ScanCameraModeOption } from '../types/scanCamera.types';
import { getCurrentUserId } from '@/services/auth/currentUser';

export const getScanCameraUserId = (): string => getCurrentUserId();

export const MODES: ScanCameraModeOption[] = [
    { id: 'LABEL', label: '라벨' },
    { id: 'FOOD', label: '사진' },
    { id: 'BARCODE', label: '바코드' },
];
