const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const {
  withDangerousMod,
  withXcodeProject,
  withInfoPlist,
  withEntitlementsPlist,
} = require('expo/config-plugins');
const TARGET = 'TaraGoNotificationSound';
const SOURCE = 'TaraGoNotificationSoundService.swift';
const SOUND_GROUP = 'TaraGoNotificationSounds';
const PROFILES = [
  'clear-young',
  'soft-cute',
  'calm-woman',
  'announcer-woman',
  'warm-man',
  'system-female',
  'system-male',
];
const unquote = (value) => String(value ?? '').replace(/^"|"$/g, '');
const groupIdentifier = (config) => `group.${config.ios.bundleIdentifier}.widgets`;

function writeFiles(config, root, iosRoot) {
  const folder = path.join(iosRoot, TARGET);
  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(path.join(root, 'plugins/notification-sound', SOURCE), path.join(folder, SOURCE));
  fs.writeFileSync(
    path.join(folder, `${TARGET}.entitlements`),
    plist.build({
      'com.apple.security.application-groups': [groupIdentifier(config)],
    }),
  );
  fs.writeFileSync(
    path.join(folder, 'Info.plist'),
    plist.build({
      CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
      CFBundleDisplayName: 'TaraGo',
      CFBundleExecutable: '$(EXECUTABLE_NAME)',
      CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
      CFBundleInfoDictionaryVersion: '6.0',
      CFBundleName: '$(PRODUCT_NAME)',
      CFBundlePackageType: 'XPC!',
      CFBundleShortVersionString: '$(MARKETING_VERSION)',
      CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
      TaraGoWidgetGroup: groupIdentifier(config),
      NSExtension: {
        NSExtensionPointIdentifier: 'com.apple.usernotifications.service',
        NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).TaraGoNotificationSoundService',
      },
    }),
  );
  const sounds = path.join(iosRoot, SOUND_GROUP);
  fs.mkdirSync(sounds, { recursive: true });
  for (const profile of PROFILES) {
    const name = `tg_fallback_v1_${profile}.caf`;
    fs.copyFileSync(
      path.join(root, 'assets/notification-fallbacks', name),
      path.join(sounds, name),
    );
  }
}

function configureSounds(project) {
  const objects = project.hash.project.objects;
  const main = project.getFirstTarget();
  if (!project.pbxGroupByName('Resources')) {
    const resources = project.addPbxGroup([], 'Resources');
    project.addToPbxGroup(resources.uuid, project.getFirstProject().firstProject.mainGroup);
  }
  let group = Object.entries(objects.PBXGroup).find(
    ([key, value]) => !key.endsWith('_comment') && unquote(value.name) === SOUND_GROUP,
  );
  if (!group) {
    const added = project.addPbxGroup([], SOUND_GROUP, SOUND_GROUP);
    project.addToPbxGroup(added.uuid, project.getFirstProject().firstProject.mainGroup);
    group = [added.uuid, added.pbxGroup];
  }
  for (const profile of PROFILES) {
    const name = `tg_fallback_v1_${profile}.caf`;
    if (
      !group[1].children.some(
        ({ value }) => unquote(objects.PBXFileReference[value]?.path) === name,
      )
    )
      project.addResourceFile(name, { target: main.uuid }, group[0]);
  }
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
      `${config.ios.bundleIdentifier}.notification-sound`,
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
  for (const source of [SOURCE]) {
    if (
      !group[1].children.some(
        ({ value }) => unquote(objects.PBXFileReference[value]?.path) === source,
      )
    )
      project.addSourceFile(source, { target: targetId }, group[0]);
  }
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
      PRODUCT_BUNDLE_IDENTIFIER: `"${config.ios.bundleIdentifier}.notification-sound"`,
      PRODUCT_NAME: `"${TARGET}"`,
      SKIP_INSTALL: 'YES',
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: '"1,2"',
    });
    current.buildSettings.CODE_SIGN_ENTITLEMENTS = `"${TARGET}/${TARGET}.entitlements"`;
    if (unquote(current.name) === 'Debug')
      current.buildSettings.SWIFT_ACTIVE_COMPILATION_CONDITIONS = '"$(inherited) DEBUG"';
  }
  return project;
}

module.exports = function withNotificationSound(config) {
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.security.application-groups'] = [
      ...new Set([
        ...(mod.modResults['com.apple.security.application-groups'] || []),
        groupIdentifier(config),
      ]),
    ];
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    mod.modResults.TaraGoWidgetGroup = groupIdentifier(config);
    return mod;
  });
  const eas = ((config.extra ??= {}).eas ??= {});
  const ios = (((eas.build ??= {}).experimental ??= {}).ios ??= {});
  ios.appExtensions = [
    ...(ios.appExtensions || []).filter((entry) => entry.targetName !== TARGET),
    {
      targetName: TARGET,
      bundleIdentifier: `${config.ios.bundleIdentifier}.notification-sound`,
      entitlements: { 'com.apple.security.application-groups': [groupIdentifier(config)] },
    },
  ];
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      writeFiles(config, mod.modRequest.projectRoot, mod.modRequest.platformProjectRoot);
      return mod;
    },
  ]);
  return withXcodeProject(config, (mod) => {
    configureProject(mod.modResults, config);
    configureSounds(mod.modResults);
    return mod;
  });
};
