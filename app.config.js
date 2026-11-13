const { withEntitlementsPlist, withInfoPlist, withAppDelegate } = require('expo/config-plugins');

// iOS 27 kills apps at launch that don't adopt the UIScene life cycle. The SDK 57 prebuild
// template still starts React Native from the app delegate, so hand window creation to Expo's
// ExpoAppSceneDelegate. ponytail: drop once the prebuild template ships scene support.
const withSceneLifecycle = (config) =>
  withAppDelegate(
    withInfoPlist(config, (cfg) => {
      cfg.modResults.UIApplicationSceneManifest = {
        UIApplicationSupportsMultipleScenes: false,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [
            {
              UISceneConfigurationName: 'Default Configuration',
              UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
            },
          ],
        },
      };
      return cfg;
    }),
    (cfg) => {
      cfg.modResults.contents = cfg.modResults.contents
        .replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
        .replace(/#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow[\s\S]*?#endif\n/, '');
      return cfg;
    }
  );

// Free (personal) Apple teams can't sign the Push Notifications capability.
// EXPO_NO_PUSH=1 npx expo run:ios drops the entitlement expo-notifications adds,
// so local dev builds sign; remote push won't work in that build.
const withoutPush = (config) =>
  withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });

// Android react-native-maps renders Google Maps and needs a key. Kept out of git:
// set GOOGLE_MAPS_API_KEY in .env.local / EAS env (secret visibility).
const withMapsKey = (config) =>
  process.env.GOOGLE_MAPS_API_KEY
    ? {
        ...config,
        android: {
          ...config.android,
          config: {
            ...config.android?.config,
            googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY },
          },
        },
      }
    : config;

// Android push needs Firebase's google-services.json. EAS: upload it as a file env
// var GOOGLE_SERVICES_JSON (resolves to a path); locally: drop it in the repo root.
const fs = require('fs');
const withFirebase = (config) => {
  const file =
    process.env.GOOGLE_SERVICES_JSON ??
    (fs.existsSync('./google-services.json') ? './google-services.json' : undefined);
  return file ? { ...config, android: { ...config.android, googleServicesFile: file } } : config;
};

module.exports = ({ config }) => {
  const withKey = withSceneLifecycle(withFirebase(withMapsKey(config)));
  if (!process.env.EXPO_NO_PUSH) return withKey;
  // NotificationIsland reads extra.noPush and falls back to local notifications.
  return withoutPush({ ...withKey, extra: { ...withKey.extra, noPush: true } });
};
