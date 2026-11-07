const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const { withXcodeProject, withInfoPlist, withDangerousMod } = require('expo/config-plugins');
const TARGET = 'TaraGoWidgets';
const unquote = (value) => String(value ?? '').replace(/^"|"$/g, '');

/** 이미 생성된 프로젝트에서도 위젯만 제거하고 알림 확장과 Scheme 설정은 보존한다. */
function removeWidgetProject(project) {
  const objects = project.hash.project.objects;
  const removed = new Set();
  const remove = (section, id) => {
    if (!id) return;
    removed.add(id);
    delete objects[section]?.[id];
    delete objects[section]?.[`${id}_comment`];
  };
  for (const [id, target] of Object.entries(objects.PBXNativeTarget || {})) {
    if (id.endsWith('_comment') || unquote(target.name) !== TARGET) continue;
    for (const { value } of target.buildPhases || []) {
      for (const section of [
        'PBXSourcesBuildPhase',
        'PBXFrameworksBuildPhase',
        'PBXResourcesBuildPhase',
        'PBXCopyFilesBuildPhase',
        'PBXShellScriptBuildPhase',
      ]) {
        const phase = objects[section]?.[value];
        if (!phase) continue;
        for (const file of phase.files || []) remove('PBXBuildFile', file.value);
        remove(section, value);
      }
    }
    const list = objects.XCConfigurationList?.[target.buildConfigurationList];
    for (const config of list?.buildConfigurations || [])
      remove('XCBuildConfiguration', config.value);
    remove('XCConfigurationList', target.buildConfigurationList);
    remove('PBXFileReference', target.productReference);
    remove('PBXNativeTarget', id);
    for (const value of Object.values(objects.PBXProject || {})) {
      if (value && typeof value === 'object') delete value.attributes?.TargetAttributes?.[id];
    }
  }
  for (const [id, group] of Object.entries(objects.PBXGroup || {})) {
    if (id.endsWith('_comment') || unquote(group.name || group.path) !== TARGET) continue;
    for (const child of group.children || []) remove('PBXFileReference', child.value);
    remove('PBXGroup', id);
  }
  for (const [id, value] of Object.entries(objects.PBXTargetDependency || {})) {
    if (!id.endsWith('_comment') && removed.has(value.target)) {
      remove('PBXContainerItemProxy', value.targetProxy);
      remove('PBXTargetDependency', id);
    }
  }
  for (const [id, value] of Object.entries(objects.PBXBuildFile || {})) {
    if (!id.endsWith('_comment') && removed.has(value.fileRef)) remove('PBXBuildFile', id);
  }
  for (const section of Object.values(objects)) {
    for (const value of Object.values(section)) {
      if (!value || typeof value !== 'object') continue;
      for (const key of ['children', 'files', 'dependencies', 'targets', 'buildPhases']) {
        if (Array.isArray(value[key]))
          value[key] = value[key].filter((ref) => !removed.has(ref.value));
      }
    }
  }
  return project;
}

function cleanInfo(info) {
  delete info.TaraGoWidgetAPIOrigins;
  return info;
}
function cleanupFiles(iosRoot, projectName) {
  // 음성 알림도 기존 App Group을 사용하므로 그룹·공유 키는 제거하지 않는다.
  const notificationInfo = path.join(iosRoot, 'TaraGoNotificationSound', 'Info.plist');
  const group = fs.existsSync(notificationInfo)
    ? plist.parse(fs.readFileSync(notificationInfo, 'utf8')).TaraGoWidgetGroup
    : undefined;
  const info = path.join(iosRoot, projectName, 'Info.plist');
  if (fs.existsSync(info)) {
    const value = cleanInfo(plist.parse(fs.readFileSync(info, 'utf8')));
    if (group) value.TaraGoWidgetGroup = group;
    fs.writeFileSync(info, plist.build(value));
  }
  const entitlements = path.join(iosRoot, projectName, `${projectName}.entitlements`);
  if (group && fs.existsSync(entitlements)) {
    const value = plist.parse(fs.readFileSync(entitlements, 'utf8'));
    const key = 'com.apple.security.application-groups';
    value[key] = [...new Set([...(value[key] || []), group])];
    fs.writeFileSync(entitlements, plist.build(value));
  }
  fs.rmSync(path.join(iosRoot, TARGET), { recursive: true, force: true });
  const build = path.join(iosRoot, 'build');
  if (fs.existsSync(build))
    for (const directory of fs.readdirSync(build)) {
      fs.rmSync(path.join(build, directory, `${projectName}.app`, 'PlugIns', `${TARGET}.appex`), {
        recursive: true,
        force: true,
      });
    }
}

module.exports = function withRemovedTransitWidget(config) {
  const ios = config.extra?.eas?.build?.experimental?.ios;
  if (ios?.appExtensions)
    ios.appExtensions = ios.appExtensions.filter((value) => value.targetName !== TARGET);
  config = withInfoPlist(config, (mod) => {
    mod.modResults = cleanInfo(mod.modResults);
    return mod;
  });
  config = withXcodeProject(config, (mod) => {
    removeWidgetProject(mod.modResults);
    return mod;
  });
  return withDangerousMod(config, [
    'ios',
    (mod) => {
      cleanupFiles(
        mod.modRequest.platformProjectRoot,
        mod.modRequest.projectName,
        config.ios.bundleIdentifier,
      );
      return mod;
    },
  ]);
};
module.exports.removeWidgetProject = removeWidgetProject;
module.exports.cleanupFiles = cleanupFiles;
