# 타라고 Airbnb 색감과 귀여운 선택 영역 정리

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement the independent UI areas, then review and verify.

**Goal:** 기존 알림·지도 흐름을 유지하면서 밝고 귀여운 게임 느낌의 일관된 UI를 제공한다. 별도 선택·확인 버튼을 추가하지 않고 선택 영역 전체를 터치한다.

**Architecture:** 기존 theme/mapUi/alertColors 토큰을 공통 Airbnb 팔레트로 맞춘다. 기능별 UI는 기존 컴포넌트를 유지하고 시각 상태와 누름 피드백만 바꾼다. Query·Zustand·API·지도 카메라·기본 역 심벌 로직은 변경하지 않는다.

**Tech Stack:** Expo 57, React Native, Expo Symbols, 기존 네이티브 탭과 바텀 시트.

- [x] 공통 팔레트·모서리·버튼·탭·툴바를 통일한다. 원본 코랄 #FF385C는 장식에, 대비가 필요한 글자와 주요 동작은 #D92850에 둔다.
- [x] 알림의 교통수단·종류·요일·시간·반경 선택 영역을 둥글고 부드러운 입체감으로 다듬는다. 점선 추가 카드·간결한 문구·44px 터치 영역을 유지한다.
- [x] 지도 검색과 알림 대상 선택 패널을 같은 팔레트와 선택 영역으로 맞추고 별도 ‘선택’ 문구를 제거한다.
- [x] 버스·지하철 상세와 저장 항목을 같은 표면·모서리·아이콘 규칙으로 맞춘다. 공식 호선·노선 분류색은 유지한다.
- [x] 기존 디자인 문서를 최종 구현과 맞추고 타입·린트·관련 동작 점검·iOS/Android 번들 및 가능한 화면 검증을 수행한다.

실제 네이티브 화면을 실행할 수 없으면 화면 미검증을 명확히 보고한다. 외부 폰트·새 라이브러리·직접 제작 지도 심벌은 추가하지 않는다.

검증: 타입·린트·색상 대비 검사, 기존 검색/알림 흐름 점검 18개, iOS·Android 프로덕션 번들 생성 통과. iPhone 18 Pro 시뮬레이터의 알림 목록과 편집 화면 확인. Android 실기기 렌더링과 새 바이너리의 네이티브 시작 화면은 미확인.
