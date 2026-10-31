# 탑승 확인과 오늘 알림 종료

2026-11-01. 시안 확인 뒤 사용자가 구현을 승인했다. 버스·지하철 서버 제어, 앱 상태 표시, Android 응답 작업, iOS 네이티브 응답 프록시를 연결했다. 운영 배포와 잠금·종료 상태의 실제 푸시 검증은 별도다.

## 화면과 동작

알림을 펼치면 `탔어요 · 오늘은 그만`과 선택적인 `5분 뒤 다시 알림` 버튼을 표시한다. 기본 알림 본문을 누르는 동작은 현재의 지도 이동을 유지한다. 버튼을 누르는 행위를 확인으로 사용하므로 추가 확인 창을 반복해서 띄우지 않는다.

- 탔어요: 선택한 예약의 현재 운행일 알림·재알림과 그 예약만을 위한 API 감시를 중단한다. 예약의 enabled와 요일·시간·방면·반경 설정은 바꾸지 않는다.
- 다음 예약일: 감시 조건이 다시 성립하면 자동으로 재개한다. 매일 예약이면 내일, 평일 예약의 금요일 다음이면 월요일이다. 자정을 넘는 예약은 기존 한국 시간 운행일 기준을 재사용한다.
- 위치 알림: 같은 예약에 대해 오늘 종료를 기록하고 당일 반경 재진입에도 다시 보내지 않는다. 다음 설정 요일에는 새 위치 확인과 반경 조건이 성립할 때 재개한다.
- 5분 뒤 다시 알림: 현재 운행 회차 안에서만 잠깐 미룬다. 예약 종료나 반경 이탈보다 오래 연장하지 않는다. 차량이 없는 경우 도착 안내를 만들어 보내지 않는다.
- 다른 예약에는 영향을 주지 않는다. 같은 역·정류소를 사용하는 다른 활성 예약이 있으면 그 예약의 공유 API 조회는 유지한다.

## 앱과 서버

앱이 카테고리와 액션을 등록하고 서버 푸시에 categoryId를 넣는다. 현재 use-alert-runtime은 actionIdentifier를 고유 처리 키로 쓰지만 실제로는 본문 탭과 동일하게 지도만 연다. 탑승·미루기 액션의 분기와 서버 API가 새로 필요하다.

서버는 발송 시 예약·기기·알림 종류·설정 지문·회차 만료 시각이 담긴 HMAC 서명 토큰을 함께 보낸다. `/alerts/actions`는 이 한정 토큰으로 인증하고 소유권·설정 지문·만료를 검증한 뒤 settings.notificationControl에 pausedUntil 또는 snoozedUntil을 저장한다. 기기 bearer는 푸시에 넣지 않는다. 중복 미루기는 종료 시각을 연장하지 않고, 과거 회차 토큰은 다음 회차를 중단할 수 없다.

워커는 외부 조회 대상을 묶기 전에 중단·미루기 상태를 제외하고, 발송 직전에도 다시 확인한다. 다음 회차는 기존 회차 식별자와 다르므로 자정에 모든 예약을 수정하는 별도 작업 없이 재개할 수 있다. 서버 확인 후에만 앱에 ‘오늘은 쉬어요 / 다음 예약일 …’을 표시한다. 실패·오프라인 요청은 완료로 표시하지 않고 재시도 상태를 보존한다.

## 플랫폼 구현 선택

iOS와 Android에 알림 액션 버튼이 존재하며 Expo 57은 setNotificationCategoryAsync를 제공한다. iPhone에서는 알림을 길게 눌러 펼치면 앱이 제공한 빠른 동작을 볼 수 있다. 버튼 외형과 배치는 시스템 UI가 결정한다. 시안은 구성을 설명하는 모형이다.

Expo 57 문서는 앱 종료·백그라운드 상태에서 액션 탭에 의한 registerTaskAsync 실행을 Android에만 명시한다. iOS에서 앱을 열지 않고 서버 중단을 바로 처리하는 경험이 목표라면 네이티브 알림 응답 처리를 별도로 설계·검증해야 한다. 현재 Expo iOS 소스의 NotificationCenterManager/Emitter는 응답을 JS 이벤트로 넘긴 뒤 completionHandler를 즉시 완료하므로 기본 JS 리스너만으로 종료 상태 처리 완료를 보장한다고 가정하지 않는다. Expo의 기존 delegate를 덮어쓰지 않는 방식으로 연동해야 한다.

단순한 첫 구현은 opensAppToForeground=true로 액션 후 앱을 열어 API를 처리하는 방식이다. 사용자가 원한 ‘알림에서 바로 처리’ 경험에는 iOS 네이티브 처리와 Android 백그라운드 액션을 함께 검증하는 방식을 추천한다. 잠금 상태·네트워크 오류·앱 종료·중복 터치·오래된 알림·자정 넘는 예약을 실기기로 확인해야 한다.

## 확인한 공식 자료

- [Apple: iPhone 알림의 빠른 동작](https://support.apple.com/ko-kr/guide/iphone/iph6534c01bc/ios)
- [Apple: 알림 액션 처리](https://developer.apple.com/documentation/usernotifications/handling-notifications-and-notification-related-actions)
- [Expo 57: 액션 카테고리와 백그라운드 처리](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)
- [Expo: 푸시 categoryId](https://docs.expo.dev/push-notifications/sending-notifications/)

## 구현과 검증

- iOS: `plugins/with-notification-actions.js`가 AppDelegate 프록시를 생성한다. 기본 알림 탭은 Expo delegate로 전달하고 빠른 동작은 URLSession으로 먼저 처리한다. 실패는 Keychain에 저장해 앱 복귀 시 재시도한다. 운영 주소는 기존 EAS production 환경의 공개 API 주소를 재사용하며 개발 빌드는 Metro 호스트의 3000번 포트를 따른다.
- Android: TaskManager 응답 작업과 실행 중 리스너를 연결하고 실패 응답은 SecureStore에 보존한다.
- 일시 중단 상태는 예약의 enabled와 별개이며 카드에 표시한다. 같은 예약에 시간·위치 알림이 함께 켜져 있으면 함께 중단·미루며, 다른 예약은 유지한다. 명시적으로 예약을 수정하면 기존 일시 중단 상태는 초기화된다.
- 위치 알림의 다음 날 재개는 새 위치 관측을 기다린다. 5분 미루기는 창 종료·반경 이탈 조건을 연장하지 않는다.
- 서버 단위 테스트, 실제 로컬 PostgreSQL/HTTP 검증, 앱 타입·린트·양 플랫폼 번들, iOS Debug 빌드로 검증한다. 실제 APNs/FCM 알림에서 잠금·종료 상태 버튼 동작은 아직 확인하지 않았다.
- 새 네이티브 코드가 포함되어 OTA만으로 적용되지 않는다. 서버 배포와 새 앱 빌드가 모두 필요하다.
