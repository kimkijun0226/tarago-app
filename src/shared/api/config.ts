/** 앱 번들에 포함되는 공개 API 주소이며, 인증키를 넣으면 안 된다. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.tarago.cloud';
