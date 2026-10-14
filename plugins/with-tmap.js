const { withInfoPlist, withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/** Inject a restricted mobile map key into native SDK configuration. */
module.exports = function withTmap(config, { appKey = process.env.TMAP_API_KEY } = {}) {
  config = withInfoPlist(config, config => {
    if (appKey) config.modResults.TMapAppKey = appKey;
    return config;
  });
  return withAndroidManifest(config, config => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    if (appKey) AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, 'cloud.tarago.tmap.APP_KEY', appKey);
    return config;
  });
};
