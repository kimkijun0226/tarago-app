# TaraGo 귀여운 교통 알림 앱 레퍼런스

2026-10-31 사용자 요청: 전체 UI 재구성, 버스·지하철이 드러나는 로고, 귀여운 컴포넌트와 높은 글자 가시성. 카드 라운드 12–16px 승인.

| 레퍼런스 | 확인한 자료 | TaraGo에 적용 | 적용하지 않을 것 |
| --- | --- | --- | --- |
| Transit | https://help.transitapp.com/article/93-how-to-use-transit | 노선 번호·방면·도착시간을 한눈에 읽는 위계 | 모든 행을 강한 원색으로 채우는 방식 |
| Transit 실시간 구분 | https://help.transitapp.com/article/445-how-to-track-departures-on-your-transit-line | 시간표와 실시간 출처가 섞이지 않게 설명·상태를 구분 | 정보 출처를 캐릭터로 대체하는 것 |
| Citymapper GO | https://citymapper.com/news/597/go-your-personal-trip-assistant | 대상 선택→조건 설정의 짧고 명확한 단계 | 길찾기 기능 추가 |
| Finch | https://finchcare.com/ | 작은 캐릭터와 부드러운 카드, 편안한 표면 | 베이지·초록 배경, 과도한 장식 |
| Duolingo 형태 | https://blog.duolingo.com/shape-language-duolingos-art-style/ | 아이콘과 일러스트의 일관된 형태·친근함 | 두꺼운 게임 버튼, 캐릭터·브랜드 복제 |
| Duolingo 디자인 자료 | https://blog.duolingo.com/hub/design/ | 화면 전체에 같은 조형 언어를 유지 | 본문에 장식 글꼴 적용 |
| Things | https://culturedcode.com/things/ | 여백·목록과 제목의 선명한 위계 | 정보가 잘리는 지나치게 작은 글씨 |
| Todoist 알림 | https://www.todoist.com/help/todoist/features/introduction-to-reminders-9PezfU | 예약·위치 조건의 구별과 간결한 설정 | 기능·과금 구조 복제 |
| Radix Colors | https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale | 배경·선택·경계·글자의 역할별 색 분리 | 연한 배경색을 본문 글자에 사용 |

## 구현 방향

버스와 지하철을 억지로 종 모양에 합치지 않고 서로 구별되는 교통수단 한 쌍으로 표현한다. 일러스트는 시작·빈 상태·설정 진입에 집중하고, 실제 도착정보 목록은 숫자와 글씨가 주인공이 되게 한다.

흰 카드, 아주 옅은 파란 바탕, 명확한 파랑 선택 상태, 작은 노란 신호. 일반 카드 16px·컨트롤 12px. 반복 요일과 선택 칩은 눌린 상태가 배경과 글자 대비로 드러나게 한다. 헤더 아이콘은 배경으로 감싸지 않는다. API·알림 규칙·지도 좌표는 보존한다.

## 앱 아이콘 — 2026-10-31

카카오맵, 카카오톡, 네이버 지도, 무신사, 올리브영의 공식 App Store 아이콘을 확인했다. 큰 대표 도형, 명확한 전경·배경 대비, 작은 크기의 식별성을 참고했다. 타사 로고·색상 조합을 복제하지 않는다. TaraGo는 밝은 파랑 바탕과 흰색 알림 종을 사용하며, 종 안의 창과 두 램프로 교통 알림을 표현한다. 그라데이션·입체 효과·장식은 사용하지 않는다.

- [카카오맵](https://apps.apple.com/kr/app/id304608425)
- [카카오톡](https://apps.apple.com/kr/app/id362057947)
- [네이버 지도](https://apps.apple.com/kr/app/id311867728)
- [무신사](https://apps.apple.com/kr/app/id1003139529)
- [올리브영](https://apps.apple.com/kr/app/id873779010)
