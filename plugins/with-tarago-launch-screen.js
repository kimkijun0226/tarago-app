/** iOS의 기존 Expo 시작 화면 캐시와 분리된 브랜드 시작 화면을 생성한다. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { IOSConfig, withFinalizedMod, withXcodeProject } = require('expo/config-plugins');

const plist = require('@expo/plist').default;

const LAUNCH_NAME = 'TaraGoLaunchScreen';

module.exports = function withTaragoLaunchScreen(config) {
  config = withXcodeProject(config, (mod) => {
    const projectName = mod.modRequest.projectName;
    const filepath = `${projectName}/${LAUNCH_NAME}.storyboard`;
    if (!mod.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath,
        groupName: projectName,
        isBuildFile: true,
        project: mod.modResults,
      });
    }
    for (const [fileRef, file] of Object.entries(mod.modResults.pbxFileReferenceSection())) {
      if (typeof file === 'object' && file.path?.replaceAll('"', '') === filepath) {
        file.lastKnownFileType = 'file.storyboard';
        file.fileEncoding = 4;
        delete file.explicitFileType;
        const linked = Object.values(mod.modResults.pbxBuildFileSection()).some(
          (entry) => typeof entry === 'object' && entry.fileRef === fileRef,
        );
        if (!linked) {
          const resource = {
            uuid: mod.modResults.generateUuid(),
            fileRef,
            basename: `${LAUNCH_NAME}.storyboard`,
            group: 'Resources',
            target: mod.modResults.getTarget('com.apple.product-type.application').uuid,
          };
          mod.modResults.addToPbxBuildFileSection(resource);
          mod.modResults.addToPbxResourcesBuildPhase(resource);
        }
      }
    }
    return mod;
  });
  return withFinalizedMod(config, [
    'ios',
    async (mod) => {
      // Expo의 스플래시 플러그인이 최신 이미지와 배경을 생성한 뒤 복사해야 한다.
      const nativeRoot = path.join(mod.modRequest.platformProjectRoot, mod.modRequest.projectName);
      await fs.copyFile(
        path.join(nativeRoot, 'SplashScreen.storyboard'),
        path.join(nativeRoot, `${LAUNCH_NAME}.storyboard`),
      );
      // Expo가 기본 이름을 다시 쓰므로 모든 모드 완료 후 런치 파일명을 맞춘다.
      const infoPath = path.join(nativeRoot, 'Info.plist');
      const info = plist.parse(await fs.readFile(infoPath, 'utf8'));
      info.UILaunchStoryboardName = LAUNCH_NAME;
      await fs.writeFile(infoPath, plist.build(info));
      return mod;
    },
  ]);
};
