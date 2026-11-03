# 음성 알림

예약별 음성 알림은 기본으로 켜져 있고, 기본 여성(system-female)·기본 남성(warm-man)·맑은 여성(clear-young)·발랄한 여성(calm-woman)·아나운서 여성(announcer-woman)을 선택하고 미리 들을 수 있다. soft-cute·system-male은 기존 예약만 지원한다. 기본 선택은 clear-young이며 버스·지하철 각각의 설정에 voiceProfile을 저장한다.

앱은 공통 Axios와 TanStack Query로 공개 카탈로그 GET /alerts/voices를 조회한다. 예약의 notificationVoice에는 provider qwen3 또는 system과 profile 및 문구별 키가 포함된다. 전경의 활성 예약에만 인증한 POST /alerts/voice/:transport/:id/prepare로 준비를 요청하고 GET으로 상태를 확인한다. 폴링은 3초 간격, 전경 세션당 최대 10분이며 실패·서비스 미설정·백그라운드·비활성 예약에서는 중단한다. 앱 복귀 시 상태를 다시 확인한다.

ready 응답의 완성된 전체 음원 목록을 네이티브 모듈에 전달한다. 상대 URL은 공통 API 주소로 해석하고 기기 bearer 인증으로 내려받는다. 네이티브 다운로드·OS 알림 파일 준비가 모두 끝난 뒤 현재 예약 키와 활성 상태를 재확인하여 기존 ready PUT을 보낸다. 작업은 직렬화하고 목록 캐시 갱신은 일괄 처리한다. 두 교통수단 목록이 모두 확인된 경우에만 오래된 파일을 정리한다.

iOS 새 빌드는 프로필별 짧은 기본 안내 CAF 7개를 앱에 포함한다. 실제 리소스가 모두 있을 때만 native bundledVersion=1을 제공한다. 버스·지하철 저장 요청의 X-TaraGo-Voice-Bundle: 1 헤더로 같은 저장 트랜잭션에서 준비 상태를 등록하므로 첫 푸시부터 선택 목소리로 보낸다. 기존 예약은 앱 루트에서 bundledVersion:1, exactReady:false로 등록한다. 상세 파일 준비 완료 뒤에는 exactReady:true로 승격한다.

지원이 확인된 예약의 APNs sound는 항상 선택한 프로필의 tg_fallback_v1_<profile>.caf다. 상세 도착 파일명은 voiceExactSound 데이터와 mutableContent:true로 전달한다. TaraGoNotificationSound 서비스 확장은 앱 그룹 Library/Sounds의 파일명·인코딩·길이를 확인한 경우에만 상세 음성으로 바꾼다. 파일 없음·준비 실패·ETA 없음·확장 미실행에서도 원래 선택 목소리의 번들 안내를 유지한다. 번들 문장은 “도착 알림입니다. 앱에서 도착 정보를 확인해 주세요.”이고 특정 버스나 시간을 주장하지 않는다.

상세 iOS 파일은 mono 22,050Hz 16-bit PCM CAF로 저장하고, 잠금 뒤에도 읽을 수 있도록 completeUntilFirstUserAuthentication 보호를 적용한다. 기존 IMA4 파일도 서비스 확장에서 읽을 수 있다. 구버전 앱에는 새 파일명을 보내지 않아 기존 동작을 보존한다. Android 8 이상은 기존 private WAV와 알림 채널 방식을 유지한다. 소리 허용·무음 모드·집중 모드·채널 차단 등 OS 설정을 우회하지 않는다.

기본 여성·남성은 apiVersion 3 모듈에서 기기의 무료 한국어 TTS로 미리 음원을 만든다. 서버가 정한 phrase·maxMinutes·schedule을 사용하며 시스템 음성의 키는 AI 캐시와 분리한다. iOS는 AVSpeechSynthesisVoice.gender가 요청 성별과 일치하는 한국어 음성이 있을 때만 선택을 허용하고 AVSpeechSynthesizer.write 결과를 29초 미만 CAF로 저장한다. Android는 한국어 음성 성별을 신뢰성 있게 확인할 표준 메타데이터가 없어 기본 여성·남성을 지원 불가로 표시한다. 다른 성별 음성이나 전경 실시간 낭독으로 대체하지 않는다. 기본 음성 미리 듣기도 현재 버스 번호를 같은 네이티브 파일 생성기로 읽는다.

실제 기기의 잠금·종료 후 원격 APNs/FCM 소리 재생은 별도 수동 검증이 필요하다.

Android는 운영체제의 알림 채널 수 제한이 있어 누적 채널 450개 전에 생성을 제한한다. 한도를 넘는 예약은 기본 알림음으로 안내하며 다른 예약의 준비는 계속한다. 앱에서 음원을 지워도 OS가 삭제된 채널을 집계할 수 있어 할당 이력은 유지한다.

차분한 AI 여성은 기존보다 낮고 안정적인 성숙한 톤의 새 참조로 교체했다. 해당 음성만 qwen3-calm-v3 캐시를 사용해 첫 번째 clear-young 참조와 캐시는 보존한다. iOS 시뮬레이터에서는 기본 여성(Yuna)의 실 CAF 생성·캐시·미리 듣기·취소를 확인했다. 설치된 한국어 남성 음성이 없어 남성은 지원 불가로 표시됨을 확인했다. 실제 아이폰의 음성 목록은 기기 설치 상태에 따라 다르다.

## 2026-11-02 검증

프로필별 CAF 7개는 길이·PCM 인코딩·디코딩·무음 여부를 검증했고 앱 빌드 리소스 포함을 확인했다. 선택 음성 서비스 확장과 위젯을 포함한 arm64 시뮬레이터 통합 빌드, 앱 타입 검사·린트·프로덕션 JS 번들을 확인했다. 서비스 확장 검증기는 실제 CAF와 파일 없음/손상/경로 탈출/앱 그룹 없음 시나리오를 임시 스크립트로 검사했다.

이 기능은 새 네이티브 빌드가 필요하다. 실제 아이폰 잠금·앱 종료 상태 APNs 재생과 서명된 Archive/TestFlight 업로드는 아직 검증하지 않았다. 음소거·집중 모드·알림 소리 차단은 우회하지 않는다. 시스템 기본 안내 번들의 실제 음성 출처는 assets/notification-fallbacks/SOURCES.md를 따른다.
