# Flutter KYC -> React Native conversion notes

Source: `/Users/meondev/Desktop/FlutterKYCApp/lib` (Flutter, untouched).
Output: this project (React Native CLI, TypeScript, package/bundle `com.bpwealth.stoxbox`).
The stray web file `lib/api/import React, { useEffect, useState, use.ts` is not part of the Flutter app and was **not** ported.

## Status of verification
- `npx tsc --noEmit`: 0 errors.
- `npx eslint . --ext .ts,.tsx`: 0 errors (warnings are mostly `react-native/no-inline-styles`).
- `react-native bundle` for Android and iOS: both succeed (Metro).
- A Dart-symbol-by-symbol scan (679 methods/getters/functions) and a user-visible-string scan were run against `src/`. Everything found is ported; the only real gap found (`isDetailspanUserEntryField` – PAN/DOB on `detailspan` must not be pre-filled from API) was fixed in `hooks/conditionalForm.ts` and `HomePage.tsx`.
- NOT verified: native builds and runtime on device/emulator (needs Xcode / Android SDK).

## Before first run
1. Disk is very low on this machine (~500 MiB free at the end, 167 MiB earlier). Free space before building.
2. `cd ios && bundle install && pod install` (needs Xcode + CocoaPods).
3. Android: open `android/` in Android Studio or `npx react-native run-android`.
4. `google-services.json` / `GoogleService-Info.plist` were copied from the Flutter project.
5. Secrets (`ssoSecretKey`, URLs) live in `src/config/env.ts` exactly as in the Flutter `env_config.dart`; move to env config when desired.

## File mapping
| Flutter | React Native |
|---|---|
| `main.dart`, `app.dart` | `index.js`, `App.tsx`, `src/navigation/{AppNavigator.tsx,router.ts,types.ts}` |
| `config/*` | `src/config/{env,firebaseOptions}.ts` |
| `theme/kyc_theme.dart` | `src/theme/kycTheme.ts` |
| `api/*` | `src/api/*` |
| `services/*` | `src/services/*` |
| `store/app_store.dart` | `src/store/appStore.tsx` |
| `hooks/conditional_form.dart` | `src/hooks/conditionalForm.ts` |
| `utils/*` | `src/utils/*` |
| `sso/*` | `src/sso/ssoTempCredentialsGate.ts` |
| `components/*` | `src/components/*` |
| `pages/home_page.dart` | `src/pages/HomePage.tsx` |
| `pages/webview_page.dart` | `src/pages/{WebViewPage.tsx,webViewController.ts,webViewHelpers.ts,webViewScripts.ts}` |
| `pages/kyc_completed_page.dart`, `page_not_found.dart` | `src/pages/*` |
| Android MethodChannel `com.bpwealth.stoxbox/payment` | Kotlin `PaymentModule` / `PaymentPackage` |

## Plugin replacements
go_router -> @react-navigation native-stack (`goTo()` resets the stack like `GoRouter.go`); provider -> `ChangeNotifier` + `useNotifier` hooks; flutter_inappwebview -> react-native-webview; flutter_secure_storage -> react-native-keychain; shared_preferences -> AsyncStorage; firebase_core/auth -> @react-native-firebase (modular API); google_sign_in -> @react-native-google-signin; file_picker -> @react-native-documents/picker; open_filex -> @react-native-documents/viewer; path_provider/dart:io -> @dr.pogodin/react-native-fs; permission_handler -> react-native-permissions; fluttertoast -> react-native-toast-message (`Fluttertoast.showToast` shim); flutter_svg/gradients -> react-native-svg; cookies -> @react-native-cookies/cookies; internet_connection_checker_plus -> HEAD reachability pings (same URLs, 4 s interval, 10 s timeout) in `connectivityController.tsx`.

## Intentional adaptations / approximations
HomePage pattern: Flutter `State` fields live in a stable object `h`; `setState(fn)`/`rerender()` re-render; `addPostFrameCallback` -> `postFrame` queue flushed in an effect; `showDialog`/bottom sheets -> state-driven `Modal`s.

WebView (`react-native-webview` has no direct equivalent for several `flutter_inappwebview` hooks):
- Navigation interception is synchronous (`onShouldStartLoadWithRequest`): external-app launches, IPV and RPD links are fire-and-cancel instead of awaited policy decisions.
- No `onNavigationResponse`; the user-gesture flag for downloads is cached (`f.gesture`) and a blob-download hook is injected.
- Popups (`onCreateWindow`) -> `onOpenWindow` overlay. Geolocation/camera permissions are given via props.
- "Try Again" remounts the WebView (`webKey`). Snackbars are an in-page overlay plus toast. iOS uses `KeyboardAvoidingView`.

Visual/approximate:
- Some Material icons (`g_mobiledata` etc.) use approximated glyph paths; M3 `onSurface` `#1D1B20`, AlertDialog surface `#ECE6F0` are hard-coded.
- Flutter `CircularProgressIndicator` -> SVG spinner; mobile "+91" prefix visibility mimics Flutter's focus behaviour approximately.
- Signature PNG is encoded in JS (`signaturePng.ts`) instead of `dart:ui`.
- Dart `String.hashCode` is emulated (`dartStringHashCode`) so BP Wealth unlisted-field ordering matches; exact parity with the Dart VM is best-effort.
- Tariff PDF: Android asset (`android/app/src/main/assets/bpwealth_tariff_plan.pdf`) + iOS Metro asset in a WebView dialog.
- `StorageService` writes that Dart left un-awaited are awaited.
- `dart:io File` -> `PickedFile`.
- Dart's unused multipart-request construction in `_prepareFormData` is not replicated.
- Dead code intentionally not ported: `_buildStepper` in `KycCompletedPage`; `_startReversePennyPolling` is ported but, as in Dart, never started. The stepper in HomePage is hidden (`showStepper = false`) as in Flutter.
- Error-page content inside the scrolling layout stays top-aligned (as Flutter's `Center` inside a scroll view), vertically centred only on the WebView-return screen.

## Manual follow-ups
- Run on real devices: Digilocker, eSign, RPD, UPI intents, camera/IPV, Google Sign-In (SHA-1 / URL scheme from `GoogleService-Info.plist`), file/PDF-password flow.
- Check iOS `Info.plist` usage strings and `LSApplicationQueriesSchemes`; Android manifest `<queries>` (already added).
