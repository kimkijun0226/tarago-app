# Notification Actions Implementation Plan

**Goal:** 알림에서 현재 회차를 종료하거나 5분 미루고 다음 예약일에 자동 재개한다.
**Architecture:** 기존 settings JSON에 종류별 일시 중단을 기록한다. 서버가 발급한 회차 한정 서명 토큰으로 응답을 인증하고 iOS 네이티브·Android 백그라운드에서 같은 API를 호출한다.
**Tech Stack:** NestJS/PostgreSQL, Expo 57, Swift UserNotifications.
**Spec:** docs/design/notification-actions-proposal.md (사용자 구현 승인됨).

## Constraints
- enabled와 예약 조건을 변경하지 않는다. 다른 예약에 영향이 없다.
- 앱 기존 변경을 보존하고 새 의존성을 추가하지 않는다.
- 앱 저장소에 테스트를 추가하지 않고 임시 검증을 사용한다.
- 커밋·푸시·배포는 이번 범위에 없다.

## Review focus
오래된 알림·중복 액션·자정 넘는 예약·위치 이탈·오프라인 실패를 검증한다.

## Tasks
- [x] 서버: notification-actions.ts의 회차 만료/중단 계산, notification-actions.service.ts의 HMAC 토큰과 트랜잭션 API를 추가한다. alerts/subway worker의 조회 전 게이트와 푸시 categoryId/actionToken을 연결한다.
- [x] 앱: 카테고리·액션 큐·Android TaskManager를 연결한다. 본문 탭은 지도를 유지하고 액션은 서버 응답 후 캐시를 갱신한다. 저장 카드에 중단 상태를 표시하고 중단된 도착 조회를 제외한다.
- [x] iOS: 설정 플러그인으로 Expo delegate를 전달하는 네이티브 프록시와 Keychain 재시도 큐를 추가한다. 일반 알림 처리와 완료 핸들러를 보존한다.
- [x] 검증: 서버 빌드/린트/관련 테스트, 앱 타입/린트/번들, 네이티브 컴파일을 실행하고 최종 diff를 확인한다. 잠금/종료 상태 실기기 푸시는 실행 여부를 따로 보고한다.
