# P2-1: 온보딩 — Gender + Birth Year 추가 Walkthrough

## Changes Made

### Data Model

- **`profile.types.ts`**: Added `Gender` type (`male | female | other | undisclosed`)
- **`User.ts`**: Added `gender?: Gender` and `birthYear?: number` to `UserProfile`
- **`profile.constants.ts`**: Added `GENDER_OPTIONS` constant (4 options with emoji icons)

### Onboarding (4→5 Steps)

| Step  | 내용                              |  Status  |
| :---: | :-------------------------------- | :------: |
|   1   | Welcome                           | existing |
| **2** | **Profile — Gender + Birth Year** |  ✨ NEW  |
|   3   | Permissions                       | shifted  |
|   4   | Allergies + Severity              | shifted  |
|   5   | Complete                          | shifted  |

### Profile Step Features

- **Gender**: 4-option card grid (Male/Female/Other/Prefer not to say)
- **Birth Year**: `−`/`+` stepper with live age display ("25 yrs old")
- Skip and Continue buttons
- Data saved via `UserService.CreateOrUpdateProfile()`

### i18n

- `en.json` / `ko.json`: 13 new `onboarding.profile.*` keys

### Bug Fix

- All `theme.tint` → `theme.primary` (dark mode에서 흰색 버튼 문제 해결)

## Modified Files

| File                                                                                                                                 | Change                       |
| :----------------------------------------------------------------------------------------------------------------------------------- | :--------------------------- |
| [profile.types.ts](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/profile/types/profile.types.ts)             | `Gender` type                |
| [User.ts](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/models/User.ts)                                               | `gender`, `birthYear` fields |
| [profile.constants.ts](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/profile/constants/profile.constants.ts) | `GENDER_OPTIONS`             |
| [onboarding.tsx](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/app/onboarding.tsx)                                    | 5-step flow + Profile step   |
| [en.json](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/i18n/resources/en.json)                              | `onboarding.profile.*` keys  |
| [ko.json](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/i18n/resources/ko.json)                              | `onboarding.profile.*` keys  |

## Welcome Screen Enhancements (HTML Mockup Match)

### UI & Animations

- **Floating Badges**: Implemented CSS `animate-bounce` equivalent using `react-native-reanimated` (3s/4s loops).
- **Hero Image**: Fixed `borderRadius` clipping (`resizeMode="cover"`) and optimized framing (`height: 120%`, cropped top).

### Content Carousel (Bento Grid)

Expanded to **4 Pages** after validating codebase capabilities (`travelerCardLanguage`, `aiCore`, `tripStats`):

| Page  | Theme               | Features                                                   | Source                 |
| :---- | :------------------ | :--------------------------------------------------------- | :--------------------- |
| **1** | **Core Analysis**   | Scan labels, Detect instantly, Global support              | Core                   |
| **2** | **Personalization** | Safe Eating, Personalized, History Log                     | `tripStats`            |
| **3** | **Global Travel**   | Travel Mode (Auto-translate), Show to Chef, Emergency Info | `travelerCardLanguage` |
| **4** | **Data Trust**      | Trusted Data (USDA/FDA), Privacy First, Secure Cloud       | `aiCore`               |

- **Interaction**: Horizontal swipe with `pagingEnabled`.
- **Pagination**: Styled indicators (Pill + Dot) matching main onboarding flow.

## Permissions Step Implementation (HTML Mockup Match)

### UI & UX

- **Hero Section**: "Let's set up your lens" title with 3D-style icon visualization (Camera + Gallery icons).
- **Interactive Toggles**: Implemented specific switches for **Camera Access** (Default: On) and **Photo Library** (Default: Off).
- **Glassmorphism**: Applied `theme.surface` with border and shadow to match the mockup's card style.

### Logic

- **Selective Requests**: `requestOnboardingPermissions` now accepts `(camera, library)` flags.
- **Flow Control**: "Allow Access" button requests _only_ the enabled permissions.
- **i18n**: Updated keys (`onboarding.permissions.*`) to match the narrative tone ("protect you from allergens", "see what you eat").

### Bug Fix: Permission Toggle Persistence

- **Problem**: Selective permission toggles (Camera/Gallery) were reset to default values when navigating back from the Allergies step.
- **Solution**: Lifted toggle states (`cameraAllowed`, `libraryAllowed`) from `PermissionsStep` to the `useOnboardingFlow` hook. States now persist throughout the onboarding session.

### Bug Fix: Allergies Step Layout & Scroll

- **Problem**: The title/subtitle were partially cut off at the top, and the page failed to scroll when the list of selected allergens became long.
- **Solution**:
  - Separated `ScrollView`'s `contentContainerStyle` from the main `flex: 1` container.
  - Added `stepScrollContent` to allow natural content expansion.
  - Implemented `heroAreaScroll` with specific top padding to prevent content clipping by fixed UI elements (like the back button).
  - Applied these improvements to both `AllergiesStep` and `ProfileStep`.

### Feature Addition: Location Permission in Onboarding

- **Goal**: Allow users to grant location access during onboarding for better UX (auto-country detection).
- **Implementation**:
  - Added `locationAllowed` toggle to `PermissionsStep`.
  - Updated `onboardingPermissionService` to include `expo-location` request.
  - Updated `useOnboardingFlow` to manage the new state.
  - Added i18n strings for Location Access in English and Korean.
