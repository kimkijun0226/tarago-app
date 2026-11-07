/** Expo의 기본 버전 모드가 끝난 뒤 앱·확장의 버전 기준을 app.json으로 통일한다. */
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const xcode = require('xcode');
const { withFinalizedMod } = require('expo/config-plugins');

function syncVersions(config, iosRoot, projectName) {
  const projectPath = path.join(iosRoot, `${projectName}.xcodeproj`, 'project.pbxproj');
  const project = xcode.project(projectPath);
  project.parseSync();
  const objects = project.hash.project.objects;
  for (const target of Object.values(objects.PBXNativeTarget)) {
    if (!target || typeof target !== 'object' || !target.buildConfigurationList) continue;
    for (const { value } of objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations) {
      const settings = objects.XCBuildConfiguration[value].buildSettings;
      settings.CURRENT_PROJECT_VERSION = config.ios.buildNumber;
      settings.MARKETING_VERSION = config.ios.version || config.version;
    }
  }
  fs.writeFileSync(projectPath, project.writeSync());
  const infoPath = path.join(iosRoot, projectName, 'Info.plist');
  const info = plist.parse(fs.readFileSync(infoPath, 'utf8'));
  info.CFBundleVersion = '$(CURRENT_PROJECT_VERSION)';
  info.CFBundleShortVersionString = '$(MARKETING_VERSION)';
  fs.writeFileSync(infoPath, plist.build(info));
}

module.exports = function withIosVersions(config) {
  return withFinalizedMod(config, ['ios', async mod => {
    syncVersions(mod, mod.modRequest.platformProjectRoot, mod.modRequest.projectName);
    return mod;
  }]);
};
module.exports.syncVersions = syncVersions;
