/**
 * Food Lens Data Models
 * 
 * "여행자의 안전한 식사"라는 핵심 가치를 실현하기 위한 데이터 구조입니다.
 * 단순 개인정보뿐만 아니라, AI 분석의 기준이 되는 '알레르기 프로필'이 핵심입니다.
 */

export interface UserProfile {
  uid: string;           // Firebase Auth User ID
  email: string;
  name?: string;         // Display Name
  profileImage?: string; // Avatar URL
  photoURL?: string;     // Legacy support
  
  // 핵심: AI 분석의 기준이 되는 개인화 정보
  safetyProfile: UserSafetyProfile;

  // 여행지 편의성 정보
  settings: UserSettings;

  createdAt: string;     // ISO Date String
  updatedAt: string;     // ISO Date String
  
  // Trip Management
  currentTripStart?: string; // ISO Date String of when the current trip started
  currentTripLocation?: string; // e.g. "Tokyo, Japan"
  currentTripCoordinates?: UserCoordinates;
}

export interface UserSafetyProfile {
  allergies: string[]; // 예: ['peanut', 'shellfish', 'egg']
  dietaryRestrictions: string[]; // 예: ['vegan', 'halal', 'gluten-free']
  dislikedIngredients?: string[]; // (선택) 오이, 고수 등 기호 식품
}

export interface UserSettings {
  language: string; // 앱 UI 표시 언어 (예: 'ko-KR', 'en-US')
  targetLanguage?: string; // Traveler Allergy Card 번역 언어 (auto/null = 위치 기반)
  autoPlayAudio: boolean; // 분석 결과 오디오 자동 재생 여부
  selectedEmoji?: string; // 대시보드 히어로 이모지 (예: '🍎', '🍊')
}

export interface UserCoordinates {
  latitude: number;
  longitude: number;
}

export type NewUserProfileDefaults = Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>;

// 초기 기본값 (가입 시 사용)
export const DEFAULT_USER_PROFILE: NewUserProfileDefaults = {
  safetyProfile: {
    allergies: [],
    dietaryRestrictions: [],
  },
  settings: {
    language: 'ko',
    autoPlayAudio: false,
  },
};

export const DEFAULT_AVATARS: string[] = [
  "https://api.dicebear.com/7.x/avataaars/png?seed=Felix",
  "https://api.dicebear.com/7.x/avataaars/png?seed=Aneka",
  "https://api.dicebear.com/7.x/avataaars/png?seed=Marley",
  "https://api.dicebear.com/7.x/avataaars/png?seed=Aiden",
  "https://api.dicebear.com/7.x/avataaars/png?seed=Luna",
  "https://api.dicebear.com/7.x/avataaars/png?seed=Caleb"
];
