/** @fileoverview Expo 기본 린트 규칙과 생성 산출물 제외 범위를 설정한다. */
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
]);
