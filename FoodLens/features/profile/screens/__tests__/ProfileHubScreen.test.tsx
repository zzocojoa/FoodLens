import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ProfileHubScreen from '../ProfileHubScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockHandleUpdate = jest.fn();
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

jest.mock('@/components/HapticFeedback', () => ({
    HapticTouchableOpacity: (props: Record<string, unknown>) => {
        const ReactNative = jest.requireActual('react-native');

        return <ReactNative.TouchableOpacity {...props} />;
    },
}));

jest.mock('@/components/navigation/TopLevelScreenShell', () => {
    const ReactNative = jest.requireActual('react-native');

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
        setTheme: jest.fn(),
    }),
}));

jest.mock('@/constants/theme', () => ({
    Colors: {
        light: {
            background: '#FFFFFF',
            surface: '#F8FAFC',
            border: '#E2E8F0',
            textPrimary: '#0F172A',
            textSecondary: '#64748B',
            shadow: '#000000',
        },
        dark: {
            background: '#020617',
            surface: '#0F172A',
            border: '#1E293B',
            textPrimary: '#F8FAFC',
            textSecondary: '#94A3B8',
            shadow: '#000000',
        },
    },
}));

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

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
            setTravelerLangModalVisible: jest.fn(),
            setUiLangModalVisible: jest.fn(),
            pickImage: jest.fn(),
            handleUpdate: mockHandleUpdate,
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

jest.mock('../../profileHub/components/AnimatedThemeToggle', () => {
    return function MockAnimatedThemeToggle() {
        const ReactNative = jest.requireActual('react-native');

        return <ReactNative.Text>THEME_TOGGLE</ReactNative.Text>;
    };
});

jest.mock('../../profileHub/components/ProfileIdentitySection', () => {
    return function MockProfileIdentitySection() {
        const ReactNative = jest.requireActual('react-native');

        return <ReactNative.Text>PROFILE_IDENTITY</ReactNative.Text>;
    };
});

jest.mock('../../profileHub/components/ProfileMenuItem', () => {
    return function MockProfileMenuItem(props: { title: string; subtitle?: string }) {
        const ReactNative = jest.requireActual('react-native');

        return (
            <ReactNative.View>
                <ReactNative.Text>{props.title}</ReactNative.Text>
                {props.subtitle ? <ReactNative.Text>{props.subtitle}</ReactNative.Text> : null}
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
    Globe: () => null,
    LogOut: () => null,
    Shield: () => null,
    User: () => null,
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

    it('does not reveal build fingerprint in production even after long press', () => {
        const { getByText, queryByText } = render(<ProfileHubScreen />);

        expect(queryByText('Build Fingerprint')).toBeNull();

        fireEvent(getByText('Profile'), 'longPress');

        expect(queryByText('Build Fingerprint')).toBeNull();
    });

    it('reveals build fingerprint after long press outside production track', () => {
        Object.assign(mockBuildFingerprint, {
            installTrack: 'workspace',
            buildSourceLabel: 'workspace:next-feature-main',
            androidPackage: 'com.hoihou.foodlens.nextfeaturemain',
        });

        const { getByText, queryByText } = render(<ProfileHubScreen />);

        expect(queryByText('Build Fingerprint')).toBeNull();

        fireEvent(getByText('Profile'), 'longPress');

        expect(getByText('Build Fingerprint')).toBeTruthy();
        expect(getByText('workspace:next-feature-main')).toBeTruthy();
    });
});
