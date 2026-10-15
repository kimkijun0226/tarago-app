const { withInfoPlist, withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * @fileoverview Expo prebuild 시 iOS·Android 지도 SDK 인증 설정을 주입하는 config plugin.
 * 모바일 SDK 인증 키는 바이너리에 포함된다. 서버 전용 공공데이터 키를 이 플러그인에 넘기지 않는다.
 */
/**
 * 생성되는 네이티브 설정에 같은 TMAP 앱 키를 연결한다.
 * @param {object} config Expo가 전달한 앱 설정.
 * @param {{ appKey?: string }} options 빌드 환경의 TMAP_API_KEY를 기본값으로 쓰는 선택 설정.
 * @returns {object} Info.plist와 AndroidManifest 수정 단계가 등록된 Expo 설정.
 */
module.exports = function withTmap(config, { appKey = process.env.TMAP_API_KEY } = {}) {
  config = withInfoPlist(config, (config) => {
    if (appKey) config.modResults.TMapAppKey = appKey;
    return config;
  });
  return withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    if (appKey)
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        application,
        'cloud.tarago.tmap.APP_KEY',
        appKey,
      );
    return config;
  });
};
