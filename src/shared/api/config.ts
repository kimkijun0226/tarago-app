/** @fileoverview 공개 API 서버 주소 설정. 환경변수가 없으면 운영 서버를 사용하며 비밀 인증키는 다루지 않는다. */
/** 앱 번들에 포함되는 공개 API 주소이며, 인증키를 넣으면 안 된다. */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.tarago.cloud';
