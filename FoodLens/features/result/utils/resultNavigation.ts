export type ResultBackTarget = '/scan/camera' | null;

export const resolveResultBackTarget = ({ isNew }: { isNew: boolean }): ResultBackTarget => {
    if (isNew) {
        return '/scan/camera';
    }

    return null;
};
