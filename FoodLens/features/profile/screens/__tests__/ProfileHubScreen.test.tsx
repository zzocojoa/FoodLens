import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ProfileHubScreen from '../ProfileHubScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetTheme = jest.fn();
const mockSetTravelerLangModalVisible = jest.fn();
const mockSetUiLangModalVisible = jest.fn();
const mockBuildFingerprint = {
    version: '1.0.0',
    appName: 'FoodLens',
    appVariant: 'production',
    installTrack: 'production',
    buildSourceLabel: 'canonical-worktree',
    worktreeName: 'FoodLens-project',
    workspaceDisplayName: 'Project',
    isCanonicalPackageContext: true,
    isWorkspacePackageContext: false,
    androidPackage: 'com.hoihou.foodlens',
    iosBundleIdentifier: 'com.hoihou.foodlens',
    gitBranch: 'main',
    gitCommitSha: 'abcdef1234567890',
    gitCommitShortSha: 'abcdef1',
    gitDirty: false,
    builtAtIso: '2026-04-18T00:00:00.000Z',
};

jest.mock('expo-router', () => ({
    Stack: {
        Screen: () => null,
    },
    useRouter: () => ({
        push: mockPush,
        replace: mockReplace,
    }),
}));

jest.mock('expo-status-bar', () => ({
    StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/components/HapticFeedback', () => {
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        HapticTouchableOpacity: ({ children, ...props }: React.ComponentProps<typeof ReactNative.TouchableOpacity>) => (
            <ReactNative.TouchableOpacity {...props}>{children}</ReactNative.TouchableOpacity>
        ),
        HapticPressable: ({ children, ...props }: React.ComponentProps<typeof ReactNative.Pressable>) => (
            <ReactNative.Pressable {...props}>{children}</ReactNative.Pressable>
        ),
    };
});

jest.mock('@/components/navigation/TopLevelScreenShell', () => {
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');

    const MockShell = ({ children }: { children: React.ReactNode }) => <ReactNative.View>{children}</ReactNative.View>;

    return {
        __esModule: true,
        default: MockShell,
        getTopLevelScreenBottomPadding: () => 0,
    };
});

jest.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        theme: 'light',
        colorScheme: 'light',
        setTheme: mockSetTheme,
    }),
}));

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

jest.mock('@/features/home/components/HomeBackgroundAtmosphere', () => {
    const MockHomeBackgroundAtmosphere = () => null;

    return {
        HomeBackgroundAtmosphere: MockHomeBackgroundAtmosphere,
        __esModule: true,
        default: MockHomeBackgroundAtmosphere,
    };
});

jest.mock('@/services/auth/currentUser', () => ({
    getCurrentUserIdSnapshot: () => 'usr_profile',
}));

jest.mock('@/services/buildFingerprint', () => ({
    getBuildFingerprint: () => mockBuildFingerprint,
}));

jest.mock('@/services/travelerCardLanguage', () => ({
    normalizeTravelerTargetLanguage: (value: string | undefined) => value ?? null,
}));

jest.mock('@/services/auth/authApi', () => ({
    AuthApi: {
        logout: jest.fn(),
    },
}));

jest.mock('@/services/auth/secureSessionStore', () => ({
    AuthSecureSessionStore: {
        read: jest.fn(),
    },
}));

jest.mock('@/services/auth/sessionManager', () => ({
    clearSession: jest.fn(),
}));

jest.mock('@/services/auth/providerLogout', () => ({
    logoutFromOAuthProvider: jest.fn(),
}));

jest.mock('@/services/sync/phase2SyncQueue', () => ({
    dispatchPhase2SyncQueue: jest.fn(),
}));

jest.mock('../../profileHub/hooks/useProfileHubController', () => ({
    useProfileHubController: () => ({
        state: {
            name: 'Traveler',
            image: undefined,
            avatars: [],
            travelerLanguage: undefined,
            uiLanguage: 'en-US',
            travelerLangModalVisible: false,
            uiLangModalVisible: false,
            loading: false,
            setName: jest.fn(),
            setImage: jest.fn(),
            setTravelerLanguage: jest.fn(),
            setUiLanguage: jest.fn(),
            setTravelerLangModalVisible: mockSetTravelerLangModalVisible,
            setUiLangModalVisible: mockSetUiLangModalVisible,
            pickImage: jest.fn(),
            handleUpdate: jest.fn(),
        },
        travelerLanguageSheet: {
            panY: 0,
            panResponder: { panHandlers: {} },
            closeSheet: jest.fn(),
        },
        uiLanguageSheet: {
            panY: 0,
            panResponder: { panHandlers: {} },
            closeSheet: jest.fn(),
        },
    }),
}));

jest.mock('../../profileHub/components/ProfileIdentitySummaryCard', () => {
    return function MockProfileIdentitySummaryCard(props: {
        onPressEdit: () => void;
        onLongPressPortrait?: () => void;
    }) {
        const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');

        return (
            <ReactNative.View testID="profile-identity-summary-card">
                <ReactNative.TouchableOpacity onLongPress={props.onLongPressPortrait} testID="profile-portrait-trigger" />
                <ReactNative.TouchableOpacity onPress={props.onPressEdit} testID="profile-edit-action" />
            </ReactNative.View>
        );
    };
});

jest.mock('../../profileHub/components/ProfileSafetyPassportSection', () => {
    return function MockProfileSafetyPassportSection(props: {
        onPressHealthProfile: () => void;
        onPressTravelerLanguage: () => void;
    }) {
        const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');

        return (
            <ReactNative.View testID="profile-safety-passport-section">
                <ReactNative.TouchableOpacity onPress={props.onPressHealthProfile} testID="profile-health-profile-action" />
                <ReactNative.TouchableOpacity
                    onPress={props.onPressTravelerLanguage}
                    testID="profile-card-language-action"
                />
            </ReactNative.View>
        );
    };
});

jest.mock('../../profileHub/components/ProfileTravelModeSection', () => {
    return function MockProfileTravelModeSection(props: { onPressAppLanguage: () => void }) {
        const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');

        return (
            <ReactNative.View testID="profile-travel-mode-section">
                <ReactNative.TouchableOpacity onPress={props.onPressAppLanguage} testID="profile-app-language-action" />
            </ReactNative.View>
        );
    };
});

jest.mock('../../profileHub/components/ProfileSupportDeskCard', () => {
    return function MockProfileSupportDeskCard(props: { onPress: () => void }) {
        const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');

        return (
            <ReactNative.View testID="profile-support-desk-card">
                <ReactNative.TouchableOpacity onPress={props.onPress} testID="profile-support-desk-action" />
            </ReactNative.View>
        );
    };
});

jest.mock('../../profileHub/components/ProfileDeveloperSheet', () => {
    return function MockProfileDeveloperSheet(props: {
        rows: { label: string; value: string }[];
        title: string;
        visible: boolean;
    }) {
        const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');

        if (!props.visible) {
            return null;
        }

        return (
            <ReactNative.View testID="profile-developer-sheet">
                <ReactNative.Text>{props.title}</ReactNative.Text>
                {props.rows.map((row) => (
                    <ReactNative.Text key={row.label}>{row.value}</ReactNative.Text>
                ))}
            </ReactNative.View>
        );
    };
});

jest.mock('../../profileHub/components/LanguageSelectorModal', () => {
    return function MockLanguageSelectorModal() {
        return null;
    };
});

jest.mock('lucide-react-native', () => ({
    LogOut: () => null,
}));

describe('ProfileHubScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.assign(mockBuildFingerprint, {
            version: '1.0.0',
            appName: 'FoodLens',
            appVariant: 'production',
            installTrack: 'production',
            buildSourceLabel: 'canonical-worktree',
            worktreeName: 'FoodLens-project',
            workspaceDisplayName: 'Project',
            isCanonicalPackageContext: true,
            isWorkspacePackageContext: false,
            androidPackage: 'com.hoihou.foodlens',
            iosBundleIdentifier: 'com.hoihou.foodlens',
            gitBranch: 'main',
            gitCommitSha: 'abcdef1234567890',
            gitCommitShortSha: 'abcdef1',
            gitDirty: false,
            builtAtIso: '2026-04-18T00:00:00.000Z',
        });
    });

    it('renders the redesigned sections and opens the edit page', () => {
        const { getByTestId, getByText } = render(<ProfileHubScreen />);

        expect(getByText('Profile')).toBeTruthy();
        expect(getByTestId('profile-identity-summary-card')).toBeTruthy();
        expect(getByTestId('profile-safety-passport-section')).toBeTruthy();
        expect(getByTestId('profile-travel-mode-section')).toBeTruthy();
        expect(getByTestId('profile-support-desk-card')).toBeTruthy();

        fireEvent.press(getByTestId('profile-edit-action'));

        expect(mockPush).toHaveBeenCalledWith({
            pathname: '/profile-edit',
            params: {
                initialName: 'Traveler',
            },
        });
    });

    it('does not reveal developer info in production even after portrait long press', () => {
        const { getByTestId, queryByTestId } = render(<ProfileHubScreen />);

        expect(queryByTestId('profile-developer-sheet')).toBeNull();

        fireEvent(getByTestId('profile-portrait-trigger'), 'longPress');

        expect(queryByTestId('profile-developer-sheet')).toBeNull();
    });

    it('reveals developer info after portrait long press outside production track', () => {
        Object.assign(mockBuildFingerprint, {
            installTrack: 'workspace',
            buildSourceLabel: 'workspace:next-feature-main',
            androidPackage: 'com.hoihou.foodlens.nextfeaturemain',
        });

        const { getByTestId, getByText, queryByTestId } = render(<ProfileHubScreen />);

        expect(queryByTestId('profile-developer-sheet')).toBeNull();

        fireEvent(getByTestId('profile-portrait-trigger'), 'longPress');

        expect(getByTestId('profile-developer-sheet')).toBeTruthy();
        expect(getByText('workspace:next-feature-main')).toBeTruthy();
    });

    it('opens the health profile, support desk, and language actions from the new sections', () => {
        const { getByTestId } = render(<ProfileHubScreen />);

        fireEvent.press(getByTestId('profile-health-profile-action'));
        fireEvent.press(getByTestId('profile-support-desk-action'));
        fireEvent.press(getByTestId('profile-card-language-action'));
        fireEvent.press(getByTestId('profile-app-language-action'));

        expect(mockPush).toHaveBeenCalledWith('/health-profile');
        expect(mockPush).toHaveBeenCalledWith('/support-policies');
        expect(mockSetTravelerLangModalVisible).toHaveBeenCalledWith(true);
        expect(mockSetUiLangModalVisible).toHaveBeenCalledWith(true);
    });
});
