/** Swift 6.4의 __ObjC:: 내부 C++ 확장도 Expo의 기존 인터페이스 정리 대상에 포함한다. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.dirname(require.resolve('expo-modules-jsi/package.json'));
const target = path.join(root, 'apple/scripts/build-xcframework.sh');
const source = fs.readFileSync(target, 'utf8');
const before = '/^extension __ObjC\\./,/^}/d';
const after = '/^extension __ObjC[.:]/,/^}/d';

if (!source.includes(after)) {
  if (!source.includes(before)) {
    throw new Error(
      'ExpoModulesJSI 인터페이스 패치 대상이 변경되었습니다. SDK의 호환 처리를 확인해주세요.',
    );
  }
  fs.writeFileSync(target, source.replace(before, after));
}
