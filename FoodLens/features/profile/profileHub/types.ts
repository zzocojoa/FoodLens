export interface ProfileHubInitialState {
    name?: string;
    image?: string;
}

export interface ProfileHubControllerParams {
    userId: string;
    initialState?: ProfileHubInitialState;
}

export type LanguageOption = {
    code: string;
    label: string;
    flag: string;
};
