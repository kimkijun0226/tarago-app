const fs = require('node:fs');
const path = require('node:path');
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

module.exports = function withNotificationActions(config) {
  config = withInfoPlist(config, (mod) => {
    const origin =
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      require('../eas.json').build.production.env.EXPO_PUBLIC_API_BASE_URL;
    if (origin) {
      const url = new URL(origin);
      if (url.protocol !== 'https:')
        throw new Error('알림 액션의 운영 API 주소는 HTTPS여야 합니다.');
      mod.modResults.TaraGoNotificationAPIOrigin = url.origin;
    }
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift')
      throw new Error('알림 액션은 Swift AppDelegate가 필요합니다.');
    let source = mod.modResults.contents.replace(
      /\n\/\/ BEGIN TARAGO NOTIFICATION ACTIONS[\s\S]*?\/\/ END TARAGO NOTIFICATION ACTIONS\n?/g,
      '\n',
    );
    const original =
      'return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
    const installed =
      'let launched = super.application(application, didFinishLaunchingWithOptions: launchOptions)\n    TaraGoNotificationActions.install()\n    return launched';
    if (source.includes(original)) source = source.replace(original, installed);
    else if (!source.includes('TaraGoNotificationActions.install()'))
      throw new Error('AppDelegate 시작 지점을 찾지 못했습니다.');
    for (const line of [
      'internal import ExpoNotifications',
      'import UserNotifications',
      'import Security',
    ]) {
      if (!source.includes(line)) source = `${line}\n${source}`;
    }
    const handler = fs.readFileSync(
      path.join(
        mod.modRequest.projectRoot,
        'plugins/notification-actions/TaraGoNotificationActions.swift',
      ),
      'utf8',
    );
    mod.modResults.contents = `${source.trimEnd()}\n\n// BEGIN TARAGO NOTIFICATION ACTIONS\n${handler}\n// END TARAGO NOTIFICATION ACTIONS\n`;
    return mod;
  });
};
