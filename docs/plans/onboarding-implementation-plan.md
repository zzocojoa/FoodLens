# Fix Onboarding Allergies Step Layout and Scroll Bug

The Allergies step currently has two issues:

1. The `heroArea` (title/subtitle) is cut off at the top.
2. The page does not scroll when the selected allergens list grows beyond the screen height.

## Proposed Changes

### [Onboarding Styles]

Fix the `stepContainer` ambiguity and add a dedicated style for scrollable content containers.

#### [MODIFY] [onboarding.styles.ts](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/onboarding/styles/onboarding.styles.ts)

- Rename `stepContainer` to `stepViewContainer` (for non-scrollable views) or separate its properties.
- Add `stepScrollContent` style specifically for `ScrollView`'s `contentContainerStyle`. This will remove `flex: 1` and `justifyContent: 'center'`, which are incompatible with scrolling content.

### [Onboarding Steps]

Update the steps to use the appropriate container styles.

#### [MODIFY] [AllergiesStep.tsx](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/onboarding/components/steps/AllergiesStep.tsx)

- Change `contentContainerStyle` to use `stepScrollContent`.
- Remove `flex: 1` from the content container to enable scrolling.
- Adjust `heroArea` padding/margin if necessary.

#### [MODIFY] [ProfileStep.tsx](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/onboarding/components/steps/ProfileStep.tsx)

- Also update this step as it uses a `ScrollView` with `stepContainer` in its `contentContainerStyle`.

## Verification Plan

### Manual Verification

- Navigate to the Allergies step in the onboarding flow.
- Verify that the title and subtitle ("Your Allergies") are fully visible.
- Select several allergens so the list at the bottom becomes long.
- Verify that the page can be scrolled vertically to see all selected allergens and their severity settings.
- Verify that the "Continue" footer remains accessible.

## [NEW FEATURE] Custom Allergen Search in Onboarding

Allow users to search for and add allergens that are not in the default grid.

### [Onboarding Flow Hook]

Update `useOnboardingFlow.ts` to manage custom input state.

#### [MODIFY] [useOnboardingFlow.ts](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/onboarding/hooks/useOnboardingFlow.ts)

- Add `customInputValue` and `suggestions` state.
- Add `handleCustomInputChange` and `addCustomAllergen` handlers.
- `addCustomAllergen` should add the item to `selectedAllergies` and set default severity to 'moderate'.

### [Onboarding UI]

Update `AllergiesStep.tsx` to include the search UI.

#### [MODIFY] [AllergiesStep.tsx](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/onboarding/components/steps/AllergiesStep.tsx)

- Integrate `RestrictionInput` component below the `AllergenGrid`.
- Add a toggleable button "원하는 항목이 없나요?" (Not finding yours?) to show/hide the search input (optional, or just show it).
- Ensure the layout remains clean and scrollable.

#### [MODIFY] [en.json](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/i18n/resources/en.json) & [ko.json](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/features/i18n/resources/ko.json)

- Add necessary i18n keys for the custom allergen search UI.
