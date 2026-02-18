# iOS Build Troubleshooting Guide

이 문서는 iOS 빌드 실패 시 자주 발생하는 원인과 해결 방법을 정리한 가이드입니다. 특히 Apple 무료 개발자 계정 사용에 따른 주기적인 인증서 만료 및 Pod 설치 오류 해결이 중점적으로 다뤄집니다.

---

## 1. 🚨 **7일마다 발생하는 "Provisioning Profile" 만료**

Apple의 무료 개발자 계정은 테스트용 인증서(Certificate)와 프로비저닝 프로파일의 유효기간이 **최대 7일**로 제한됩니다.

### 🛑 증상

- `npx expo run:ios --configuration Release --device` 실행 시 빌드 실패.
- Xcode 로그에서 "No provisioning profile found for this bundle ID" 또는 "Signing failed" 메시지 발생.
- 7일 전에는 잘 되던 빌드가 갑자기 안 될 때.

### ✅ 해결 방법

`Debug` 모드 빌드를 실행하여 Xcode가 강제로 새 인증서를 발급하도록 유도해야 합니다.

1.  **Debug 모드로 앱 실행**
    ```bash
    npx expo run:ios --device
    ```
2.  실행이 완료되면 **자동으로 인증서가 갱신(Renew)**됩니다.
3.  이제 다시 Release 빌드를 실행하면 됩니다.
    ```bash
    npx expo run:ios --configuration Release --device
    ```

---

## 2. 💣 **Hermes Engine / rsync 파일 누락 오류**

CocoaPods의 캐시가 꼬이거나, 네트워크 문제로 `hermes-engine` 관련 파일이 일부만 다운로드되었을 때 발생합니다.

### 🛑 증상

- 빌드 로그 중 `rsync: /Users/.../ios/Pods/hermes-engine/...: No such file or directory` 에러 발생.
- `PhaseScriptExecution [CP] Copy XCFrameworks` 단계에서 실패.

### ✅ 해결 방법

기존 Pod 의존성을 완전히 제거하고 재설치(Clean Install)해야 합니다.

1.  **기존 Pods 및 캐시 삭제**
    ```bash
    rm -rf ios/Pods ios/Podfile.lock ios/build
    ```
2.  **재설치 (Clean Install)**
    ```bash
    cd ios && pod install && cd ..
    ```
3.  **다시 빌드 실행**
    ```bash
    npx expo run:ios --device
    ```

---

## 3. 🛡 **Xcode "Codesign Identity" 불일치**

프로젝트 설정(`project.pbxproj`)에서 `Release` 설정이 개발용 인증서(`iPhone Developer`)가 아닌 배포용(`iPhone Distribution`)으로 잘못 지정되어 있을 경우 발생합니다. (무료 계정은 배포용 인증서 사용 불가)

### 🛑 증상

- "Code signing is required for product type 'Application' in SDK 'iOS ...'"
- "No profiles for 'com.example.app' were found"

### ✅ 해결 방법

`ios/FoodLens.xcodeproj/project.pbxproj` 파일에서 `CODE_SIGN_IDENTITY` 값이 `iPhone Developer`로 설정되어 있는지 확인합니다.

```sh
# 확인 명령어
grep "CODE_SIGN_IDENTITY" ios/FoodLens.xcodeproj/project.pbxproj
```

모든 설정(`Debug`, `Release`)에서 `"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "iPhone Developer";` 로 되어 있어야 합니다.
