const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const plist = require('@expo/plist').default;
const {
  withDangerousMod,
  withXcodeProject,
  withFinalizedMod,
  withInfoPlist,
} = require('expo/config-plugins');
const TARGET = 'TaraGoNotificationContent';
const SOURCE = 'TaraGoNotificationContentViewController.swift';
const unquote = (value) => String(value ?? '').replace(/^"|"$/g, '');

function privateIPv4(host) {
  const p = host.split('.').map(Number);
  return (
    p.length === 4 &&
    p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168))
  );
}

/** The extension cannot read API settings from the host app's separate bundle. */
function apiOrigins(root) {
  const production = new URL(
    process.env.EXPO_PUBLIC_API_BASE_URL ||
      require(path.join(root, 'eas.json')).build.production.env.EXPO_PUBLIC_API_BASE_URL,
  );
  if (production.protocol !== 'https:')
    throw new Error('알림 확장의 운영 API 주소는 HTTPS여야 합니다.');
  const networks = os.networkInterfaces();
  const local = ['en0', 'en1']
    .flatMap((name) => networks[name] || [])
    .find((item) => item.family === 'IPv4' && !item.internal && privateIPv4(item.address));
  const development =
    process.env.TARAGO_NOTIFICATION_DEV_API_ORIGIN ||
    (local ? `http://${local.address}:3000` : undefined);
  if (!development) return { production: production.origin };
  const url = new URL(development);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateIPv4(url.hostname)))
    throw new Error('알림 확장의 개발 API 주소는 HTTPS 또는 사설 LAN HTTP여야 합니다.');
  return { production: production.origin, development: url.origin };
}

function configureProject(project, config) {
  const objects = project.hash.project.objects;
  const main = project.getFirstTarget();
  // node-xcode silently skips dependencies if these sections do not exist yet.
  objects.PBXTargetDependency ??= {};
  objects.PBXContainerItemProxy ??= {};
  let entry = Object.entries(objects.PBXNativeTarget).find(
    ([key, value]) => !key.endsWith('_comment') && unquote(value.name) === TARGET,
  );
  if (!entry) {
    // node-xcode adds the appex embed phase and host target dependency as well.
    const added = project.addTarget(
      TARGET,
      'app_extension',
      TARGET,
      `${config.ios.bundleIdentifier}.notification-content`,
    );
    entry = [added.uuid, added.pbxNativeTarget];
  }
  const [targetId, target] = entry;
  if (
    !main.firstTarget.dependencies.some(
      ({ value }) => objects.PBXTargetDependency[value]?.target === targetId,
    )
  )
    project.addTargetDependency(main.uuid, [targetId]);
  if (!target.buildPhases.some(({ value }) => objects.PBXSourcesBuildPhase?.[value]))
    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', targetId);
  let group = Object.entries(objects.PBXGroup).find(
    ([key, value]) => !key.endsWith('_comment') && unquote(value.name) === TARGET,
  );
  if (!group) {
    const added = project.addPbxGroup([], TARGET, TARGET);
    project.addToPbxGroup(added.uuid, project.getFirstProject().firstProject.mainGroup);
    group = [added.uuid, added.pbxGroup];
  }
  if (
    !group[1].children.some(
      ({ value }) => unquote(objects.PBXFileReference[value]?.path) === SOURCE,
    )
  )
    project.addSourceFile(SOURCE, { target: targetId }, group[0]);
  const mainConfigs = objects.XCConfigurationList[
    main.firstTarget.buildConfigurationList
  ].buildConfigurations.map(({ value }) => objects.XCBuildConfiguration[value]);
  for (const { value } of objects.XCConfigurationList[target.buildConfigurationList]
    .buildConfigurations) {
    const current = objects.XCBuildConfiguration[value];
    const mainSettings =
      mainConfigs.find(({ name }) => unquote(name) === unquote(current.name))?.buildSettings || {};
    Object.assign(current.buildSettings, {
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      CODE_SIGN_STYLE: 'Automatic',
      CURRENT_PROJECT_VERSION:
        mainSettings.CURRENT_PROJECT_VERSION || config.ios.buildNumber || '1',
      DEVELOPMENT_TEAM: mainSettings.DEVELOPMENT_TEAM || config.ios.appleTeamId || '""',
      GENERATE_INFOPLIST_FILE: 'NO',
      INFOPLIST_FILE: `"${TARGET}/Info.plist"`,
      IPHONEOS_DEPLOYMENT_TARGET: mainSettings.IPHONEOS_DEPLOYMENT_TARGET || '16.4',
      MARKETING_VERSION: mainSettings.MARKETING_VERSION || config.version || '1.0.0',
      PRODUCT_BUNDLE_IDENTIFIER: `"${config.ios.bundleIdentifier}.notification-content"`,
      PRODUCT_NAME: `"${TARGET}"`,
      SKIP_INSTALL: 'YES',
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: '"1,2"',
    });
    delete current.buildSettings.CODE_SIGN_ENTITLEMENTS;
    if (unquote(current.name) === 'Debug')
      current.buildSettings.SWIFT_ACTIVE_COMPILATION_CONDITIONS = '"$(inherited) DEBUG"';
  }
  return project;
}

module.exports = function withNotificationContent(config) {
  config = withInfoPlist(config, (mod) => {
    const origins = apiOrigins(mod.modRequest.projectRoot);
    if (origins.development)
      mod.modResults.TaraGoNotificationDevelopmentAPIOrigin = origins.development;
    return mod;
  });
  const eas = ((config.extra ??= {}).eas ??= {});
  const ios = (((eas.build ??= {}).experimental ??= {}).ios ??= {});
  ios.appExtensions = [
    ...(ios.appExtensions || []).filter((item) => item.targetName !== TARGET),
    { targetName: TARGET, bundleIdentifier: `${config.ios.bundleIdentifier}.notification-content` },
  ];
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const folder = path.join(mod.modRequest.platformProjectRoot, TARGET);
      const origins = apiOrigins(mod.modRequest.projectRoot);
      fs.mkdirSync(folder, { recursive: true });
      fs.copyFileSync(
        path.join(mod.modRequest.projectRoot, 'plugins/notification-content', SOURCE),
        path.join(folder, SOURCE),
      );
      const info = {
        CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
        CFBundleDisplayName: 'TaraGo',
        CFBundleExecutable: '$(EXECUTABLE_NAME)',
        CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
        CFBundleInfoDictionaryVersion: '6.0',
        CFBundleName: '$(PRODUCT_NAME)',
        CFBundlePackageType: 'XPC!',
        CFBundleShortVersionString: '$(MARKETING_VERSION)',
        CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
        TaraGoNotificationAPIOrigin: origins.production,
        NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
        NSExtension: {
          NSExtensionPointIdentifier: 'com.apple.usernotifications.content-extension',
          NSExtensionPrincipalClass:
            '$(PRODUCT_MODULE_NAME).TaraGoNotificationContentViewController',
          NSExtensionAttributes: {
            UNNotificationExtensionCategory: 'taragoArrival',
            UNNotificationExtensionDefaultContentHidden: true,
            UNNotificationExtensionUserInteractionEnabled: true,
            UNNotificationExtensionInitialContentSizeRatio: 0.7,
          },
        },
      };
      if (origins.development) info.TaraGoNotificationDevelopmentAPIOrigin = origins.development;
      fs.writeFileSync(path.join(folder, 'Info.plist'), plist.build(info));
      return mod;
    },
  ]);
  config = withXcodeProject(config, (mod) => {
    mod.modResults = configureProject(mod.modResults, config);
    return mod;
  });
  return withFinalizedMod(config, [
    'ios',
    (mod) => {
      // The Expo template can retain the old lower-case name; CocoaPods then adds it twice.
      const projectName = mod.modRequest.projectName;
      const workspace = path.join(
        mod.modRequest.platformProjectRoot,
        `${projectName}.xcworkspace`,
        'contents.xcworkspacedata',
      );
      if (!fs.existsSync(workspace)) return mod;
      const canonical = `group:${projectName}.xcodeproj`;
      let found = false;
      const contents = fs
        .readFileSync(workspace, 'utf8')
        .replace(
          /<FileRef\b[^>]*location\s*=\s*"([^"]+)"[^>]*(?:\/>|>\s*<\/FileRef>)/g,
          (entry, location) => {
            if (location.toLowerCase() !== canonical.toLowerCase()) return entry;
            if (found) return '';
            found = true;
            return entry.replace(/location\s*=\s*"[^"]+"/, `location = "${canonical}"`);
          },
        );
      fs.writeFileSync(workspace, contents);
      return mod;
    },
  ]);
};
