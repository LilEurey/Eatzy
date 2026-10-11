const { withEntitlementsPlist } = require('expo/config-plugins');

// Free (personal) Apple teams can't sign the Push Notifications capability.
// EXPO_NO_PUSH=1 npx expo run:ios drops the entitlement expo-notifications adds,
// so local dev builds sign; remote push won't work in that build.
const withoutPush = (config) =>
  withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });

module.exports = ({ config }) =>
  process.env.EXPO_NO_PUSH ? withoutPush(config) : config;
