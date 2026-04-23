import type { ProfileHubInitialState } from '../types';

export type ProfileEditRouteParams = {
    initialName?: string;
    initialImage?: string;
};

export type ProfileEditSearchParams = {
    initialName?: string | string[];
    initialImage?: string | string[];
};

export type ProfileEditRoute = {
    pathname: '/profile-edit';
    params: ProfileEditRouteParams;
};

const toSingle = (value: string | string[] | undefined): string | undefined => {
    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
};

const toOptionalTrimmedString = (value: string | string[] | undefined): string | undefined => {
    const singleValue = toSingle(value);

    if (typeof singleValue !== 'string') {
        return undefined;
    }

    const trimmedValue = singleValue.trim();
    if (!trimmedValue) {
        return undefined;
    }

    return trimmedValue;
};

const toOptionalString = (value: string | string[] | undefined): string | undefined => {
    const singleValue = toSingle(value);

    if (typeof singleValue !== 'string') {
        return undefined;
    }

    if (!singleValue) {
        return undefined;
    }

    return singleValue;
};

export const buildProfileEditRoute = (initialState: ProfileHubInitialState): ProfileEditRoute => {
    const initialName = toOptionalTrimmedString(initialState.name);
    const initialImage = toOptionalString(initialState.image);

    return {
        pathname: '/profile-edit',
        params: {
            ...(initialName ? { initialName } : {}),
            ...(initialImage ? { initialImage } : {}),
        },
    };
};

export const parseProfileEditSearchParams = (
    params: ProfileEditSearchParams,
): ProfileHubInitialState => {
    return {
        name: toOptionalTrimmedString(params.initialName),
        image: toOptionalString(params.initialImage),
    };
};
