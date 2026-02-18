export interface ProfileSheetProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    onUpdate: () => void | Promise<void>;
}

export type LanguageOption = {
    code: string;
    label: string;
    flag: string;
};
