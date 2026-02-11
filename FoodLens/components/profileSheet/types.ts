export interface ProfileSheetProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    onUpdate: () => void;
}

export type LanguageOption = {
    code: string;
    label: string;
    flag: string;
};
