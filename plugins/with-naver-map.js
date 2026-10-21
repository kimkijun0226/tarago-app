/** @fileoverview 빌드 환경의 네이버 지도 Client ID를 iOS·Android SDK 설정에 연결한다. */
const { withPlugins } = require('expo/config-plugins');

module.exports = function withNaverMapConfig(config) {
  require('../scripts/patch-naver-symbol-tap.cjs');
  return withPlugins(config, [
    ['@mj-studio/react-native-naver-map', { client_id: process.env.NAVER_MAP_CLIENT_ID ?? '' }],
  ]);
};
