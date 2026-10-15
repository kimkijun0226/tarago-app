# TaraGo 앱

주변 버스 정류장·도착정보, 장소 검색·길찾기, 버스·지하철 알림을 제공하는 iOS·Android 앱.
서버는 별도 `tarago-server` 저장소이며 앱 API 주소는 `https://api.tarago.cloud`다.

## 기술 구성

| 구성                             | 역할                                      |
| -------------------------------- | ----------------------------------------- |
| Expo · React Native · TypeScript | 모바일 실행 환경과 타입 검사              |
| Expo Router                      | 화면 경로와 탭·스택 구성                  |
| TMAP Vector Map SDK              | 네이티브 지도와 오버레이                  |
| TanStack Query · Axios           | 서버 상태 캐시와 공통 HTTP 요청           |
| Zustand `app-store.ts`           | 탭 숨김 여부와 알림 런타임 오류 공유      |
| SQLite KV · SecureStore          | 최근 검색·기기 사본과 알림 인증 정보 저장 |
| Expo Notifications · Location    | 푸시·접근 알림과 기기 위치 구독           |
| Prettier · ESLint                | 코드 서식과 정적 규칙 검사                |

## 코드 문서

- [현재 구조](docs/architecture.md): 실행 계층, 상태 소유권, 데이터 흐름.
- [파일별 역할](docs/file-map.md): 각 소스 파일의 책임.
- [버스 알림](docs/bus-alerts.md): 시간·접근·1시간 감시의 구분.
- [지도 검색·길찾기](docs/map-search-and-design.md): 검색 화면과 경로 표시 구성.
- [TMAP·지하철](docs/tmap-and-subway.md): SDK·API·인증 경계.

각 소스의 한글 JSDoc은 파일·함수·상태·변수와 훅의 역할을 기술한다.

## 개발 명령

| 명령                      | 역할                                        |
| ------------------------- | ------------------------------------------- |
| `npm run start:simulator` | 운영 API와 연결하는 시뮬레이터용 Metro 서버 |
| `npm run start:device`    | 실기기용 LAN Metro 서버                     |
| `npm run tmap:sdk`        | 공식 TMAP 네이티브 SDK 설치                 |
| `npm run format`          | Prettier 서식 적용                          |
| `npm run format:check`    | Prettier 서식 검사                          |
| `npm run lint`            | ESLint 검사                                 |
| `npx tsc --noEmit`        | 산출물 없는 타입 검사                       |

`EXPO_PUBLIC_API_BASE_URL`은 공개 API 주소, `TMAP_API_KEY`는 지도 SDK의 빌드 인증 변수다.
프리뷰 빌드는 Metro 없이 실행되는 설치 파일이고, 개발 빌드는 Metro의 JS 번들을 사용한다.
