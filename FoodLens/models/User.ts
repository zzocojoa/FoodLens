/**
 * Food Lens Data Models
 * 
 * "여행자의 안전한 식사"라는 핵심 가치를 실현하기 위한 데이터 구조입니다.
 * 단순 개인정보뿐만 아니라, AI 분석의 기준이 되는 '알레르기 프로필'이 핵심입니다.
 */

export interface UserProfile {
  uid: string;           // Firebase Auth User ID
  email: string;
  displayName?: string;
  photoURL?: string;
  
  // 핵심: AI 분석의 기준이 되는 개인화 정보
  safetyProfile: {
    allergies: string[];       // 예: ['peanut', 'shellfish', 'egg']
    dietaryRestrictions: string[]; // 예: ['vegan', 'halal', 'gluten-free']
    dislikedIngredients?: string[]; // (선택) 오이, 고수 등 기호 식품
  };

  // 여행지 편의성 정보
  settings: {
    language: string;    // 앱 표시 언어 (예: 'ko')
    targetLanguage?: string; // 여행지 언어 (예: 'th' - 태국어)
    autoPlayAudio: boolean; // 분석 결과 오디오 자동 재생 여부
  };

  createdAt: string;     // ISO Date String
  updatedAt: string;     // ISO Date String
  
  // Trip Management
  currentTripStart?: string; // ISO Date String of when the current trip started
  currentTripLocation?: string; // e.g. "Tokyo, Japan"
  currentTripCoordinates?: {
      latitude: number;
      longitude: number;
  };
}

// 초기 기본값 (가입 시 사용)
export const DEFAULT_USER_PROFILE: Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'> = {
  safetyProfile: {
    allergies: [],
    dietaryRestrictions: [],
  },
  settings: {
    language: 'ko',
    autoPlayAudio: false,
  },
};
