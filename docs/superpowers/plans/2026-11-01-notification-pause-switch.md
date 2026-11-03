# 펼친 iOS 알림의 오늘은 쉬어요 스위치

사용자가 승인한 범위: iOS Notification Content Extension에서 예약별 오늘 쉬기 ON/OFF. ON은 한국 자정까지 시간/위치 알림 중단, OFF는 기존 enabled/예약 조건을 유지하며 중단/미루기를 해제한다. 일반 접힌 배너는 OS UI를 유지한다. 서버 확인 전에 성공으로 표시하지 않는다. 별도 유료 서비스·의존성·배포·커밋 없음.

## 계약
- 기존 POST /alerts/actions의 서명 토큰 인증 재사용. action=status는 읽기 전용, pauseToday/resumeToday는 해당 예약만 변경.
- 응답 {alertId,transport,notificationControl,pausedToday:boolean}. 설정·만료·삭제·비활성 검증 보존. resumeToday는 새 반복 revision을 실제 상태가 바뀐 경우에만 부여.
- Native content extension category taragoArrival, UIKit UISwitch, 앱 시작 없이 URLSession으로 status/변경. 생성 당시 push token/signature를 userInfo.body 또는 최상위에서 추출. Origin은 빌드 설정에서만 신뢰, payload URL 사용 금지. redirect 금지. network fail시 되돌리고 재시도.
- plugin이 extension target/소스/Info.plist/embed를 재생성 가능하고 중복 없이 구성. Release HTTPS production origin, Debug LAN origin만 로컬 허용.
- 기존 native delegate와 JS의 category는 iOS에서 탔어요/5분 미루기만 노출해 쉬기 중복 제거; Android는 오늘 쉬기 기본 액션 유지.

## 작업
- [x] 서버: status/resumeToday와 오늘 쉬기 계약, 인증/만료/재개 멱등/조회 무변경 회귀 테스트.
- [x] iOS: content extension Swift UI/네트워크/실패·취소 처리.
- [x] plugin/config: 확장 타깃·Info·embed 생성; JS/native 버튼 등록 동기화.
- [x] 검증: 앱 타입·린트, 서버 Jest·lint·운영 타입, 플러그인 중복 적용, 확장 Swift 컴파일, Xcode 실제 빌드, final diff/review. 실기기 푸시 수동 테스트는 미실행 시 명시.

## 검증 결과
- 서버 15 suites / 93 tests, lint, 운영 타입 검사 통과.
- 앱 전체 tsc/eslint와 diff 검사 통과.
- 실제 로컬 PostgreSQL/HTTP: 버스·지하철 status 읽기 전용, 쉬기 ON/OFF, 재개 멱등, 설정 보존, 서명 위조 차단 통과. 임시 기기·예약 정리 완료.
- 실제 UIKit 확장 코드의 임시 시뮬레이터 하네스: 상태 조회, ON/OFF, 응답 전 상태 미확정, 잘못된 토큰 비활성화, 재조회, 내용 높이 검증 통과. 하네스 앱 정리 완료.
- 실제 Expo prebuild + Pods 및 확장 Debug 시뮬레이터·Release iphoneos 빌드, 확장을 포함한 전체 앱 Debug 빌드 통과. 최종 증분 빌드도 통과.
- 별도 검토에서 추가 P1/P2 없음. 실제 아이폰 APNs 펼친 알림·잠금/완전 종료·배포 서명은 미검증. 운영 배포·실기기 설치·Git 커밋/푸시는 수행하지 않음.
