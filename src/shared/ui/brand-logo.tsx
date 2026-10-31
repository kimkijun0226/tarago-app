import { Image } from 'react-native';

/** 앱 아이콘과 같은 심볼을 사용하는 고정 비율의 워드마크. */
export function BrandLogo() {
  return (
    <Image
      source={require('@/assets/brand/tarago-logo.png')}
      accessibilityLabel="TaraGo"
      accessibilityRole="header"
      resizeMode="contain"
      style={{ width: 136, height: 43.2 }}
    />
  );
}
