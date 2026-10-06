/**
 * Port of lib/firebase_options.dart.
 *
 * With @react-native-firebase the native config comes from
 * android/app/google-services.json and ios/MeonKYC/GoogleService-Info.plist
 * (both copied from the Flutter project). These values are kept for reference
 * and for the Google Sign-In web client id.
 */
export const DefaultFirebaseOptions = {
  /** Web OAuth client ID from `google-services.json` (`client_type: 3`). */
  googleOAuthWebClientId:
    '1077626154170-61kj6319g2tlhpig26uddesuio92d2oa.apps.googleusercontent.com',

  android: {
    apiKey: 'AIzaSyAO3KYu4BOG5dmh0nI4BvAYoSiFm5aLR7c',
    appId: '1:1077626154170:android:dd3a513aef1bb4cc4f6683',
    messagingSenderId: '1077626154170',
    projectId: 'stoxbox-5daa8',
    storageBucket: 'stoxbox-5daa8.appspot.com',
  },

  ios: {
    apiKey: 'AIzaSyAkia1pLuRsbNQefz-0YVFXJGRjasVK2Lg',
    appId: '1:1077626154170:ios:6cf794b257a449804f6683',
    messagingSenderId: '1077626154170',
    projectId: 'stoxbox-5daa8',
    storageBucket: 'stoxbox-5daa8.appspot.com',
    iosClientId:
      '1077626154170-es9hivvnhu47uscieen8cgj8aq1afg7g.apps.googleusercontent.com',
    iosBundleId: 'com.bpwealth.stoxbox',
  },
};
