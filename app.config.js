const { withEntitlementsPlist } = require('expo/config-plugins');

/** 무료 Apple 계정으로 실기기를 테스트할 때만 APNs 권한을 제외한다. */
function withoutPushNotifications(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
}

module.exports = ({ config }) => {
  if (process.env.TARAGO_IOS_LOCAL !== '1') return config;

  return {
    ...config,
    extra: { ...config.extra, iosPushDisabled: true },
    plugins: [withoutPushNotifications, ...config.plugins],
  };
};
