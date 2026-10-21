# 지도 검색·길찾기와 공통 UI

지도는 네이버 지도 SDK를 사용하고 장소 검색·길찾기는 서버의 TMAP API를 사용한다.
네이버·카카오 지도 화면은 이전에 UX 비교 대상으로 관찰했으며, 앱의 데이터 공급자나 실행 의존성이 아니다.

## 현재 책임

- `features/mobility/ui/mobility-search.tsx`: 장소 선택·검색·길찾기 상태 조립과 Query 연결.
- `features/mobility/ui/route-editor.tsx`: 출발·도착 입력과 이동수단 선택.
- `features/mobility/ui/place-search-results.tsx`: 최근 검색과 장소 결과 목록.
- `features/mobility/ui/place-detail.tsx`: 선택 장소 상세와 출발·도착 지정.
- `features/mobility/ui/journey-results.tsx`: 경로 비교와 이동 단계 표시.
- `features/mobility/api/mobility.ts`: 타라고 서버의 검색·경로 응답 계약.
- `app/(tabs)/index.tsx`: 지도·검색·시트 UI 배치.
- `features/map/model`: 선택 장소·경로를 네이버 지도 마커와 선으로 연결.
- `shared/ui/theme.ts`: 앱 공통 라이트 테마, 간격·글자·모서리.
- `shared/ui/map-design-tokens.ts`: 지도 화면 전용 시각 토큰.
- `shared/ui/index.ts`: 공통 테마·버튼·설정 섹션의 공개 내보내기.
- `shared/ui/app-button.tsx`, `app-section.tsx`: 공통 버튼과 설정 섹션.
- `shared/ui/map-bottom-sheet.tsx`: 지도와 시트가 공유하는 정착 높이·제스처.

## 동작과 범위

일반 검색은 장소·주소 검색이다. 검색한 장소가 버스 정류장일 때만 서버 정류장과 매칭한다.
최근 장소는 SQLite KV에 저장한다. 길찾기는 대중교통·버스·도보 모드와 경로별 승하차·환승·요금·도보 정보를 표시한다.

공급자가 반환한 실제 구간 좌표만 지도에 그린다. 버스 차량 위치를 지도에 추가하지 않는다.

일반·노선 정류장 표시는 네이버 SDK의 대중교통 레이어를 사용한다. 전국 CSV 좌표에
정류장 아이콘을 중복해서 그리거나 가까운 도로로 자동 이동시키지 않는다.
지도 심벌을 누르면 150m 이내 서버 정류장 중 이름이 같은 항목에 연결한다.
같은 이름이 여러 개면 누른 심벌에 가장 가까운 대상을 바로 연다. 이름이 없는 심벌은
25m 이내 정류장과 좌표로 연결하며 빈 지도 클릭은 처리하지 않는다. 교통수단 선택 팝업은 표시하지 않는다.
선택 핀은 실제 누른 네이버 심벌 좌표를 사용하고 서버 ID·좌표는 도착정보 조회용으로 유지한다.
검색·알림으로 진입한 정류장은 확인된 지도 심벌 좌표가 없으면 임의의 선택 핀을 추가하지 않는다.
TMAP 버스 전용 결과는 반환된 경로 중 버스·도보 경로를 고르는 방식이며 모든 조합을 보장하지 않는다.
자동차·자전거 길찾기나 네이버 지도 전체 기능·성능과의 동일성을 보장하는 구현은 아니다.

관련 명세: [TMAP·지하철](tmap-and-subway.md), [앱 구조](architecture.md).

선택 노선의 경유 정류장은 카메라 정착 시 네이버 SDK `pickAll`로 받은 실제 심벌 좌표에 기존 노선 마커를 겹친다. 이름·거리로 일대일 연결하며 모호한 후보와 표시 심벌이 없는 정류장은 임의의 서버 좌표로 대체하지 않는다. 이 연결은 `scripts/patch-naver-symbol-tap.cjs`가 iOS·Android 카메라 이벤트에 추가하므로 개발 빌드를 다시 설치해야 한다.
