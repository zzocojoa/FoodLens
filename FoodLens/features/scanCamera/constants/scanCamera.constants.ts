import { ScanCameraModeOption } from '../types/scanCamera.types';
import { getCurrentUserId } from '@/services/auth/currentUser_Logic';

export const getScanCameraUserId = (): string => getCurrentUserId();

export const MODES: ScanCameraModeOption[] = [
    { id: 'LABEL', label: 'Label' },
    { id: 'FOOD', label: 'Food' },
    { id: 'BARCODE', label: 'Barcode' },
];
