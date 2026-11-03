# AI 음성 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. No commits or deployment without user request.

**Goal:** 사용자가 승인한 두 AI 여성 음성과 성숙한 여성·남성 음성을 버스·지하철 알림 설정에서 선택하고 미리 듣고, 종료 상태에서도 선택한 목소리로 도착 알림을 받는다.
**Architecture:** 무료 Qwen3로 네 참조 음성을 보관하고 Base 모델의 참조 조건으로 문장 전체를 합성한다. Nest가 기기 소유권을 검사해 준비 작업을 예약하고 WAV를 캐시한다. 앱은 전경에서 준비 상태를 확인하고 완성된 음원만 OS 알림 파일로 내려받은 뒤 기존 ready 확인을 전송한다. 알림 발송 경로에서는 생성 API나 AI 추론을 실행하지 않는다.
**Tech Stack:** Expo 57, TanStack Query, local Expo module (Swift/Kotlin), Nest, Python Qwen3 (MLX on Apple Silicon; qwen-tts elsewhere).
**Spec:** 사용자 요청: 1·2번 모두 선택 가능, 같은 계열의 성숙한 여성·남성 추가, 무료만 사용.

## Global Constraints
- 기존 dirty 변경 보존, 앱 테스트 추가 금지, 타입·전체 lint·관련 native build 실행.
- 별도 설정 탭 없이 각 예약의 기존 음성 알림 설정을 확장한다.
- 프로필 ID: clear-young / soft-cute / calm-woman / warm-man. 기본값 clear-young.
- 설정 필드 voiceProfile?: 위 enum. voiceEnabled 기존 정책 유지.
- 새 key는 qwen3-v1·프로필·문구·최대 분·시간표 여부에 종속. 이전 기기 TTS 키 재사용 금지.
- 선택 상태의 border 두께·패딩·글꼴 굵기 고정. 평면 파랑·흰색 디자인.
- 생성 실패/준비 중/구버전 앱은 기본 알림음. 승인된 AI 음성 대신 기기 TTS로 조용히 대체하지 않는다.

## API contract
- GET /alerts/voices => { available: boolean, profiles: [{id,name,description,previewUrl:string}] }; public catalog and relative preview URL.
- GET /alerts/voices/:profile/preview => preset WAV (public, fixed allowlist).
- POST /alerts/voice/:transport/:id/prepare {key} authenticated => VoicePreparation
- GET /alerts/voice/:transport/:id/prepare?key=... authenticated => VoicePreparation (does not enqueue)
- VoicePreparation = {key,status:'queued'|'generating'|'ready'|'failed'|'unavailable',completed:number,total:number,sounds?:[{source:'r'|'s',time:string,url:string}],error?:string}; sounds only when all ready, relative URLs.
- GET /alerts/voice/:transport/:id/audio/:key/:source/:time authenticated => WAV; existing ready PUT stays.
- NotificationVoice includes profile, provider:'qwen3' besides old key/phrase/maxMinutes/schedule/readyPlatform.
- Server Python process protocol: newline JSON stdin {id,profile,text,output}; stdout {id,ok:true} or {id,ok:false,error}; text not logged, output predetermined cache WAV. Process serializes generation. Python entry voice/worker.py; env NOTIFICATION_VOICE_PYTHON controls executable, enabled only if configured. Server starts worker lazily, process limits and 120-second per-render timeout. Cache key per profile+full phrase, atomic WAVs. Failure never marks ready.
- Native module API version constant apiVersion=2. prepare accepts {key,authorization,sounds:[{source,time,url}]}; only exact stems tg_v1_key_source_time persisted. playPreview(url:string), stopPreview() added. JS checks apiVersion>=2 to avoid old native modules accepting AI profiles and synthesizing device TTS.

## Tasks
- [x] App: profile types/selection/preview + save both forms + API prepare polling through Query/runtime. Root owns native and audio assets.
- [x] Server: enum validation/descriptor keys + authenticated async preparation/cache/download pipeline + meaningful Jest tests. Root owns Python worker/assets.
- [x] Root: create mature refs, add all four references, implement persistent Python generator and native downloading/playback.
- [x] Integration: type/lint/server regressions; native builds; real local DB+HTTP preparation; generated sound checks; final diff and broad review.

## Review Focus
- Switching voice while generation is queued must not confirm old key.
- No cross-device access or arbitrary profile/text/path submitted to AI worker.
- No external paid API requests; long-running generation bounded/deduplicated, no CPU inference in push worker.
- App termination/background during download never reports ready or prevents retry.
- Unknown/missing native v2 or worker/model unavailable remains basic notification sound.
