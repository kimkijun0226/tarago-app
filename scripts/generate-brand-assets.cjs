/** SVG 원본에서 앱이 사용하는 PNG를 생성한다. 앱 실행·빌드에는 필요하지 않다. */
const fs = require('node:fs/promises');
const path = require('node:path');
let sharp;
try {
  sharp = require(process.env.TARAGO_SHARP_MODULE || 'sharp');
} catch {
  throw new Error(
    '브랜드 자산 생성용 sharp가 필요합니다. TARAGO_SHARP_MODULE에 설치된 sharp 모듈 경로를 지정하세요.',
  );
}
const root = path.join(
  path.dirname(require.resolve('./generate-brand-assets.cjs')),
  '..',
  'assets',
  'brand',
);
const variants = [
  ['tarago-icon', 1024, 1024],
  ['tarago-mark', 1024, 1024],
  ['tarago-mark-white', 1024, 1024],
  ['tarago-logo', 1020, 324],
  ['tarago-adaptive', 1024, 1024],
  ['tarago-monochrome', 1024, 1024],
];
(async () => {
  for (const [name, width, height] of variants) {
    const input = await fs.readFile(path.join(root, `${name}.svg`));
    const output = sharp(input, { density: 288 }).resize(width, height);
    if (name === 'tarago-icon') output.removeAlpha();
    await output.png().toFile(path.join(root, `${name}.png`));
  }
  console.log('TaraGo 브랜드 PNG 6개를 생성했습니다.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
