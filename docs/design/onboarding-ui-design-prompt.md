# FoodLens Onboarding UI Design Brief

## App Overview

**FoodLens** is a mobile health app that protects users with food allergies by instantly detecting allergens through AI-powered photo and barcode analysis.

- **Tagline**: "Eat safely, anywhere in the world"
- **Platform**: iOS (iPhone 15 Pro, 390×844 pt)
- **Framework**: React Native (Expo)
- **Color System**: Primary Blue `#3B82F6`, Dark mode Slate-950 `#020617` + Blue-400 `#60A5FA`

---

## Onboarding Flow — 5 Screens

### Screen 1: Welcome

- Hero illustration — food safety / AI scanning concept
- App logo + tagline
- 3 feature highlights:
  - 📸 Scan any food label with your camera
  - ⚠️ Detect allergens instantly
  - 🌍 Works in any country
- **CTA**: "Get Started"

### Screen 2: Profile

- **Gender** — 2 card options (Male 👨 / Female 👩), tap-to-select highlight
- **Birth Year** — iOS-native date spinner picker (DateTimePicker, `display="spinner"`)
  - Calculated age displayed below (e.g. "25세")
  - Privacy note: "Used to personalize nutrition guidance. Only the year is stored."
- **CTA**: "Continue"
- **Secondary**: "Skip for now"

### Screen 3: Permissions

- Camera + Photo Library permission request
- Trust-building copy explaining WHY each is needed:
  - 📷 Camera: "To scan food labels and dishes in real-time"
  - 🖼️ Photo Library: "To analyze previously saved food photos"
- Privacy reassurance: "Your photos are never stored on our servers."
- **CTA**: "Allow & Continue"
- **Secondary**: "Skip for now"

### Screen 4: Allergies + Severity

- **9 allergen cards** in a grid (multi-select):

| Allergen  | Icon |
| :-------- | :--- |
| Egg       | 🥚   |
| Milk      | 🥛   |
| Peanut    | 🥜   |
| Shellfish | 🦐   |
| Wheat     | 🌾   |
| Soy       | 🫘   |
| Tree Nuts | 🌰   |
| Fish      | 🐟   |
| Sesame    | 🫙   |

- Each selected allergen reveals a **severity toggle** (1-tap cycle):
  - ⚠️ Mild (Yellow `#F59E0B`) — discomfort, not dangerous
  - 🔶 Moderate (Orange `#F97316`) — hives, vomiting
  - 🔴 Severe (Red `#EF4444`) — anaphylaxis risk, life-threatening
- **Fixed bottom bar** with "Continue"
- **Secondary**: "Skip for now"

### Screen 5: Complete

- Celebration visual (confetti / checkmark animation)
- "You're all set!" headline
- Summary card:
  - Gender, Age, Allergen count, Severity breakdown
- **CTA**: "Start Using FoodLens"

---

## Global Elements (All Screens)

- **Progress bar** — 5 horizontal segments at top, active = blue, inactive = gray
- **Back button** — `← Back` (chevron + text), visible on screens 2–5
- **Dark mode** — full support required

---

## 2026 Design Direction

| Trend                | Application                                                              |
| :------------------- | :----------------------------------------------------------------------- |
| Bento Grid           | Modular, rounded card-based layout for feature highlights and selections |
| Glassmorphism        | Subtle frosted-glass cards with `backdrop-filter: blur`, not heavy       |
| Micro-interactions   | Spring animations on card selection, smooth transitions between steps    |
| Generous whitespace  | Breathable, premium spacing — no cramped layouts                         |
| Large typography     | Bold headlines 28–34pt, light body 15–17pt                               |
| Soft gradients       | Subtle mesh gradient backgrounds, avoid flat solid colors                |
| 3D illustrated icons | Friendly, approachable allergen icons — not flat/line style              |
| Rounded corners      | 16–24px border radius on all cards and buttons                           |
| Bottom-heavy CTAs    | Thumb-friendly placement with safe area padding                          |
| Minimal text         | Concise, action-oriented microcopy                                       |

**Design inspiration**: Apple Health, Yazio, MyFitnessPal 2025+, Flo Health

---

## Output Requirements

- Individual mockup per screen
- iPhone 15 Pro frame (390×844 pt)
- **Light mode** + **Dark mode** variants
- Include spacing and typography annotations
