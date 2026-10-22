# TaraGo 앱

주변 버스 정류장·도착정보, 정류장·지하철 검색, 버스·지하철 알림을 제공하는 iOS·Android 앱.
서버는 별도 `tarago-server` 저장소이며 앱 API 주소는 `https://api.tarago.cloud`다.

## 기술 구성

| 구성                             | 역할                                      |
| -------------------------------- | ----------------------------------------- |
| Expo · React Native · TypeScript | 모바일 실행 환경과 타입 검사              |
| Expo Router                      | 화면 경로와 탭·스택 구성                  |
| NAVER Map SDK                    | 네이티브 지도와 오버레이                  |
| TanStack Query · Axios           | 서버 상태 캐시와 공통 HTTP 요청           |
| Zustand `app-store.ts`           | 탭 숨김 여부와 알림 런타임 오류 공유      |
| SQLite KV · SecureStore          | 최근 검색·기기 사본과 알림 인증 정보 저장 |
| Expo Notifications · Location    | 푸시·접근 알림과 기기 위치 구독           |
| Prettier · ESLint                | 코드 서식과 정적 규칙 검사                |

## 코드 문서

- [현재 구조](docs/architecture.md): 실행 계층, 상태 소유권, 데이터 흐름.
- [파일별 역할](docs/file-map.md): 각 소스 파일의 책임.
- [버스 알림](docs/bus-alerts.md): 시간·접근·1시간 감시의 구분.
- [지도 검색](docs/map-search-and-design.md): 교통수단 검색과 알림 선택 흐름.
- [TMAP·지하철](docs/tmap-and-subway.md): SDK·API·인증 경계.

각 소스의 한글 JSDoc은 파일·함수·상태·변수와 훅의 역할을 기술한다.

## 개발 명령

| 명령                      | 역할                                        |
| ------------------------- | ------------------------------------------- |
| `npm run start:simulator` | 운영 API와 연결하는 시뮬레이터용 Metro 서버 |
| `npm run start:device`    | 실기기용 LAN Metro 서버                     |
| `npm run format`          | Prettier 서식 적용                          |
| `npm run format:check`    | Prettier 서식 검사                          |
| `npm run lint`            | ESLint 검사                                 |
| `npx tsc --noEmit`        | 산출물 없는 타입 검사                       |

`EXPO_PUBLIC_API_BASE_URL`은 공개 API 주소, `NAVER_MAP_CLIENT_ID`는 지도 SDK의 빌드 인증 변수다. TMAP 검색·길찾기 키는 서버에서 관리한다.
프리뷰 빌드는 Metro 없이 실행되는 설치 파일이고, 개발 빌드는 Metro의 JS 번들을 사용한다.

## Metro 없이 iOS Release 실행

프로젝트 루트에서 다음 명령을 실행한다. 네이티브 설정을 변경한 뒤에는 prebuild로 Xcode 프로젝트와 Pods를 먼저 갱신한다.

```bash
bunx expo prebuild --platform ios
bun run ios:release
```

연결한 iPhone을 선택하면 Release 앱을 빌드·설치한다. JS 번들은 앱에 포함되어 Metro를 켜지 않아도 실행된다. 운영 API 주소는 `.env.production`에 설정한다. 로컬 지도 인증은 기존 `.env.local`의 `NAVER_MAP_CLIENT_ID`를 사용한다.

Xcode에서 직접 실행하려면:

1. `ios/tarago.xcworkspace`를 연다.
2. 상단 Scheme을 `tarago`, 실행 대상을 연결한 iPhone으로 고른다.
3. **Product → Scheme → Edit Scheme → Run → Info → Build Configuration**을 **Release**로 바꾼다.
4. **Signing & Capabilities**에서 본인 Team과 자동 서명을 확인한 뒤 **⌘R**로 실행한다.
5. TestFlight/App Store 업로드용 파일은 실행 대상을 **Any iOS Device (arm64)**로 바꾸고 **Product → Archive**를 실행한다. Archive는 이미 Release 설정이다. Organizer에서 **Distribute App → App Store Connect**로 업로드한다.

일반 개발로 돌아갈 때는 Run 설정을 Debug로 되돌린다. `.xcodeproj` 대신 Pods가 포함된 `.xcworkspace`를 사용한다.

설치 파일을 공유하는 EAS 배포는 `bunx eas-cli build --platform all --profile preview`를 사용한다. 이는 스토어 공개와 별개이며 iOS는 등록된 기기에 설치한다.
