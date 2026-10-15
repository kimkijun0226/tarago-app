# 지도 검색·길찾기와 공통 UI

지도·장소 검색·길찾기는 TMAP을 사용한다. 네이버 지도 SDK, Kakao 장소 API, ODsay 경로 API를 연결하는 앱 코드는 사용하지 않는다.
네이버·카카오 지도 화면은 이전에 UX 비교 대상으로 관찰했으며, 앱의 데이터 공급자나 실행 의존성이 아니다.

## 현재 책임

- `features/mobility/ui/mobility-search.tsx`: 장소 선택·검색·길찾기 상태 조립과 Query 연결.
- `features/mobility/ui/route-editor.tsx`: 출발·도착 입력과 이동수단 선택.
- `features/mobility/ui/place-search-results.tsx`: 최근 검색과 장소 결과 목록.
- `features/mobility/ui/place-detail.tsx`: 선택 장소 상세와 출발·도착 지정.
- `features/mobility/ui/journey-results.tsx`: 경로 비교와 이동 단계 표시.
- `features/mobility/api/mobility.ts`: 타라고 서버의 검색·경로 응답 계약.
- `app/(tabs)/index.tsx`: 지도·검색·시트 UI 배치.
- `features/map/model`: 선택 장소·경로를 TMAP 지도 마커와 선으로 연결.
- `shared/ui/theme.ts`: 앱 공통 라이트 테마, 간격·글자·모서리.
- `shared/ui/map-design-tokens.ts`: 지도 화면 전용 시각 토큰.
- `shared/ui/index.ts`: 공통 테마·버튼·설정 섹션의 공개 내보내기.
- `shared/ui/app-button.tsx`, `app-section.tsx`: 공통 버튼과 설정 섹션.
- `shared/ui/map-bottom-sheet.tsx`: 지도와 시트가 공유하는 정착 높이·제스처.

## 동작과 범위

일반 검색은 장소·주소 검색이다. 검색한 장소가 버스 정류장일 때만 서버 정류장과 매칭한다.
최근 장소는 SQLite KV에 저장한다. 길찾기는 대중교통·버스·도보 모드와 경로별 승하차·환승·요금·도보 정보를 표시한다.

공급자가 반환한 실제 구간 좌표만 지도에 그린다. 버스 차량 위치를 지도에 추가하지 않는다.
TMAP 버스 전용 결과는 반환된 경로 중 버스·도보 경로를 고르는 방식이며 모든 조합을 보장하지 않는다.
자동차·자전거 길찾기나 네이버 지도 전체 기능·성능과의 동일성을 보장하는 구현은 아니다.

관련 명세: [TMAP·지하철](tmap-and-subway.md), [앱 구조](architecture.md).
