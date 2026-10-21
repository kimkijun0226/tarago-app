# 파일별 역할

현재 앱 소스의 파일 경로와 책임. 각 설명은 소스의 `@fileoverview`에 대응한다.

## 앱 진입과 공통 조립

| 파일                                                                    | 책임                                                                                                                                         |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/app/(tabs)/_layout.tsx](<../src/app/(tabs)/_layout.tsx>)           | iOS·Android의 지도/알림 탭 조립. 색상은 공통 라이트 테마, 숨김 상태는 앱 스토어에서 읽는다.                                                  |
| [src/app/(tabs)/alerts.tsx](<../src/app/(tabs)/alerts.tsx>)             | 버스 알림 라우트. URL 요청·저장된 알림으로 초기 편집 초안을 구성한다.                                                                        |
| [src/app/(tabs)/index.tsx](<../src/app/(tabs)/index.tsx>)               | 지도 탭 라우트. 지도·검색·정류장·지하철 시트를 배치한다. 데이터 조회와 선택 전환은 useMapController에 맡겨 화면 배치와 동작 규칙을 분리한다. |
| [src/app/_layout.tsx](../src/app/_layout.tsx)                           | 앱 전체의 Provider와 최상위 Router를 연결하는 조립 지점. Query·알림 런타임·제스처를 한 번 설치한다.                                          |
| [src/app/subway-alerts.tsx](../src/app/subway-alerts.tsx)               | 지하철 알림 라우트. URL의 역·노선·방면과 저장한 예약으로 초기 초안을 구성한다.                                                               |
| [src/components/animated-icon.tsx](../src/components/animated-icon.tsx) | 네이티브 스플래시와 React 화면 사이의 시작 전환 오버레이. 위치 조회는 지도 기능이 별도로 담당한다.                                           |

## 지도

| 파일                                                                                                        | 책임                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/features/map/model/use-initial-map-position.ts](../src/features/map/model/use-initial-map-position.ts) | 지도 최초 진입 좌표의 준비 상태를 관리한다. 알림 좌표를 우선하고 없으면 현재 위치를 조회한다.                                                                                                              |
| [src/features/map/model/use-map-controller.ts](../src/features/map/model/use-map-controller.ts)             | 지도 화면의 선택·전환을 조율하는 컨트롤러 훅. 정류장·노선 Query와 검색 결과를 연결하고, 최신 선택만 반영하며 카메라와 시트를 함께 전환한다. 오버레이 계산·GPS 권한·시트 내부 UI는 각 전용 모듈에 위임한다. |
| [src/features/map/model/use-map-overlays.ts](../src/features/map/model/use-map-overlays.ts)                 | 지도에 표시할 정류장·선택 장소·노선 선·방향 화살표를 계산하는 전용 훅. 입력을 표시용 데이터로 변환할 뿐 서버 요청·카메라 이동·선택 상태 변경은 하지 않는다.                                                |
| [src/features/map/ui/map-location-gate.tsx](../src/features/map/ui/map-location-gate.tsx)                   | 지도 좌표가 준비되기 전 보여 주는 로딩·재시도 화면. 위치 조회 자체는 상위 훅에 위임한다.                                                                                                                   |
| [src/features/map/ui/map-screen.styles.ts](../src/features/map/ui/map-screen.styles.ts)                     | 지도 화면의 배치와 터치 버튼 스타일. 서버 상태나 지도 선택 로직은 포함하지 않는다.                                                                                                                         |

## 정류장과 버스

| 파일                                                                                                                | 책임                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [src/features/bus-stop/api/get-bus-arrivals.ts](../src/features/bus-stop/api/get-bus-arrivals.ts)                   | 서버의 차량별 도착 정보 계약과 정류장 도착 조회 요청을 정의한다. 캐시와 폴링은 모델 훅이 맡는다.     |
| [src/features/bus-stop/api/get-bus-route-detail.ts](../src/features/bus-stop/api/get-bus-route-detail.ts)           | 노선 경유 순번·공식 도로 형상·차량 위치의 서버 계약과 상세 조회 요청을 정의한다.                     |
| [src/features/bus-stop/api/get-nearby-bus-stops.ts](../src/features/bus-stop/api/get-nearby-bus-stops.ts)           | 지도 타일 중심에서 조회하는 정류장 응답 계약과 HTTP 요청을 정의한다.                                 |
| [src/features/bus-stop/model/bus-arrival.ts](../src/features/bus-stop/model/bus-arrival.ts)                         | 차량 응답을 노선별 도착 목록으로 묶고 ETA와 남은 정류장 수를 화면 문구로 변환한다.                   |
| [src/features/bus-stop/model/bus-route-presentation.ts](../src/features/bus-stop/model/bus-route-presentation.ts)   | 노선 시트 높이 전환과 왕복 경유 정류장 식별에 필요한 순수 화면 계산을 제공한다.                      |
| [src/features/bus-stop/model/bus-route-sheet-data.ts](../src/features/bus-stop/model/bus-route-sheet-data.ts)       | 노선 상세 시트가 소비할 도착 차량 선택과 정류장별 차량 그룹화를 담당한다.                            |
| [src/features/bus-stop/model/bus-stop-tile.ts](../src/features/bus-stop/model/bus-stop-tile.ts)                     | 지도 조회 영역을 Web Mercator 타일로 나눠 이동 중에도 정류장 Query 캐시를 재사용한다.                |
| [src/features/bus-stop/model/combine-bus-stops.ts](../src/features/bus-stop/model/combine-bus-stops.ts)             | 여러 타일의 정류장 응답을 서버 정류장 ID 기준으로 합치는 순수 결합 함수를 제공한다.                  |
| [src/features/bus-stop/model/map-markers.ts](../src/features/bus-stop/model/map-markers.ts)                         | 로컬 정류장 이미지를 공통 지도 마커 입력으로 변환한다.                                               |
| [src/features/bus-stop/model/route-direction-markers.ts](../src/features/bus-stop/model/route-direction-markers.ts) | 공식 노선 좌표의 표시용 우측 보정·모서리 곡선·방향 마커를 계산한다. 보정값은 실제 차선 GPS가 아니다. |
| [src/features/bus-stop/model/use-bus-arrivals.ts](../src/features/bus-stop/model/use-bus-arrivals.ts)               | 정류장 도착 Query의 폴링·재시도와 폐쇄 정류장의 지도 캐시 제거를 관리한다.                           |
| [src/features/bus-stop/model/use-bus-route-detail.ts](../src/features/bus-stop/model/use-bus-route-detail.ts)       | 선택 정류장 경유 순번별 노선 상세 Query와 화면 활성 중 차량 위치 갱신을 관리한다.                    |
| [src/features/bus-stop/model/use-nearby-bus-stops.ts](../src/features/bus-stop/model/use-nearby-bus-stops.ts)       | 지도 타일 Query를 관찰하고 새 영역이 준비될 때까지 이전 영역의 정류장 표시를 유지한다.               |
| [src/features/bus-stop/ui/bus-arrival-row.tsx](../src/features/bus-stop/ui/bus-arrival-row.tsx)                     | 노선별 도착 두 차량과 노선 상세·알림 설정 진입 버튼을 표시하는 목록 행이다.                          |
| [src/features/bus-stop/ui/bus-route-bottom-sheet.tsx](../src/features/bus-stop/ui/bus-route-bottom-sheet.tsx)       | 노선 경유 목록과 차량 위치를 표시하고 시트 높이에 맞춰 선택 정류장의 스크롤을 조정한다.              |
| [src/features/bus-stop/ui/bus-stop-bottom-sheet.tsx](../src/features/bus-stop/ui/bus-stop-bottom-sheet.tsx)         | 선택 정류장의 도착 목록·새로고침·노선 및 알림 진입 UI를 구성한다. 서버 상태는 Query 훅이 소유한다.   |
| [src/features/bus-stop/ui/route-stop-row.tsx](../src/features/bus-stop/ui/route-stop-row.tsx)                       | 노선 경유 정류장 한 행의 왕복 레일·선택 도착 시간·차량 위치를 표시한다.                              |

## 버스 알림

| 파일                                                                                                                  | 책임                                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [src/features/bus-alert/api/alerts.ts](../src/features/bus-alert/api/alerts.ts)                                       | 기기 자격 증명을 보안 저장소에서 얻어 버스·지하철 공용 인증과 버스 알림 HTTP 요청을 제공한다.  |
| [src/features/bus-alert/model/alert-runtime.ts](../src/features/bus-alert/model/alert-runtime.ts)                     | React 외부에서도 실행되는 접근 감지 작업과 네이티브 권한·푸시·지오펜스 경계를 연결한다.        |
| [src/features/bus-alert/model/alert-storage.ts](../src/features/bus-alert/model/alert-storage.ts)                     | 서버 알림의 마지막 사본을 SQLite 키값 저장소에 보관해 React 외부의 접근 감지 작업이 읽게 한다. |
| [src/features/bus-alert/model/bus-alert.ts](../src/features/bus-alert/model/bus-alert.ts)                             | 버스 알림 데이터 계약과 지오펜스 영역·도착 안내 문구·재방문 판단의 순수 계산을 제공한다.       |
| [src/features/bus-alert/model/immediate-monitoring.ts](../src/features/bus-alert/model/immediate-monitoring.ts)       | 반복 예약을 수정하지 않고 접근 동의 시점의 한국 시간으로 일회성 1시간 감시 입력을 만든다.      |
| [src/features/bus-alert/model/use-alert-runtime.ts](../src/features/bus-alert/model/use-alert-runtime.ts)             | 루트에서 위치 감지와 알림 응답 구독을 연결하고 오류를 앱 스토어에 공유한다.                    |
| [src/features/bus-alert/model/use-alerts.ts](../src/features/bus-alert/model/use-alerts.ts)                           | TanStack Query가 알림 서버 상태를 소유하고 변경 성공 시 기기 사본과 쿼리 캐시를 동기화한다.    |
| [src/features/bus-alert/model/use-monitoring-sessions.ts](../src/features/bus-alert/model/use-monitoring-sessions.ts) | 서버의 임시 감시 레코드와 OS의 감시 종료 안내 예약을 함께 생성·연장·중지한다.                  |
| [src/features/bus-alert/ui/alert-editor-form.tsx](../src/features/bus-alert/ui/alert-editor-form.tsx)                 | 알림 초안의 필드와 도착정보 미리보기를 표시한다. 서버 저장과 권한 요청은 화면이 담당한다.      |
| [src/features/bus-alert/ui/alert-runtime.tsx](../src/features/bus-alert/ui/alert-runtime.tsx)                         | 루트에서 위치 감지와 알림 응답 구독을 실행하는 화면 없는 런타임 컴포넌트.                      |
| [src/features/bus-alert/ui/alert-screen-styles.ts](../src/features/bus-alert/ui/alert-screen-styles.ts)               | 알림 목록과 편집 폼이 공유하는 테마 기반 시각 규칙을 정의한다.                                 |
| [src/features/bus-alert/ui/alert-time-field.tsx](../src/features/bus-alert/ui/alert-time-field.tsx)                   | 한국 시간 HH:mm 값을 플랫폼 시간 선택기의 Date와 상호 변환해 부모 폼에 전달한다.               |
| [src/features/bus-alert/ui/alerts-screen.tsx](../src/features/bus-alert/ui/alerts-screen.tsx)                         | 버스 알림의 목록·편집 UI와 권한 확인·저장 흐름. 초기 초안은 라우트에서 전달받는다.             |
| [src/features/bus-alert/ui/monitoring-sessions-panel.tsx](../src/features/bus-alert/ui/monitoring-sessions-panel.tsx) | 접근 알림의 감시 제안과 현재 임시 감시의 남은 시간 및 시작·연장·중지 조작을 표시한다.          |

## 검색과 길찾기

| 파일                                                                                                      | 책임                                                                                                              |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [src/features/mobility/api/mobility.ts](../src/features/mobility/api/mobility.ts)                         | 장소 검색·길찾기의 서버 계약과 요청 함수를 정의한다. UI와 위치 권한 처리는 호출자가 담당한다.                     |
| [src/features/mobility/model/place-kind.ts](../src/features/mobility/model/place-kind.ts)                 | 검색 공급자의 분류와 명칭을 지도에서 사용할 장소 종류·정류장 비교 이름으로 해석한다.                              |
| [src/features/mobility/model/search-history.ts](../src/features/mobility/model/search-history.ts)         | 최근 선택한 장소 최대 10개를 기기 저장소에 보관하고 손상된 JSON을 복구 가능한 빈 목록으로 처리한다.               |
| [src/features/mobility/ui/journey-results.tsx](../src/features/mobility/ui/journey-results.tsx)           | 서버 경로의 교통수단 필터·정렬과 선택 경로의 승하차 타임라인을 표시한다.                                          |
| [src/features/mobility/ui/mobility-search.tsx](../src/features/mobility/ui/mobility-search.tsx)           | 지도 위 장소 검색·출발/도착 편집·경로 선택 흐름을 연결한다. 서버 결과는 Query, 편집 중 UI는 로컬 상태가 소유한다. |
| [src/features/mobility/ui/place-detail.tsx](../src/features/mobility/ui/place-detail.tsx)                 | 선택 장소의 이름·주소와 출발·도착·지하철 도착정보 진입 동작을 표시한다.                                           |
| [src/features/mobility/ui/place-search-results.tsx](../src/features/mobility/ui/place-search-results.tsx) | 장소 검색의 결과·최근 목록과 추천 카테고리를 표시한다. 검색 실행과 기록 저장은 부모가 담당한다.                   |
| [src/features/mobility/ui/route-editor.tsx](../src/features/mobility/ui/route-editor.tsx)                 | 길찾기의 출발·도착 입력과 이동수단 선택 UI. 경로 요청과 끝점 상태 변경은 부모가 담당한다.                         |
| [src/features/mobility/ui/saved-places.tsx](../src/features/mobility/ui/saved-places.tsx)                 | 기기에 저장한 지하철역과 부모가 제공한 최근 장소를 보여주고 선택을 지도에 전달한다.                               |
| [src/features/mobility/ui/search-categories.ts](../src/features/mobility/ui/search-categories.ts)         | 홈 검색과 결과 화면에서 공통으로 제공하는 추천 장소 카테고리.                                                     |

## 지하철

| 파일                                                                                                              | 책임                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [src/features/subway/api/get-subway-arrivals.ts](../src/features/subway/api/get-subway-arrivals.ts)               | 서버가 정규화한 역별 실시간 열차 도착정보의 계약과 조회 요청을 정의한다.                               |
| [src/features/subway/api/get-subway-station.ts](../src/features/subway/api/get-subway-station.ts)                 | 역·노선 메타데이터, 영업일 시간표, 공개 시설정보의 서버 계약과 요청을 정의한다.                        |
| [src/features/subway/api/subway-alerts.ts](../src/features/subway/api/subway-alerts.ts)                           | 기기 인증을 붙여 지하철 도착 알림 예약을 조회·생성·수정·삭제한다.                                      |
| [src/features/subway/model/subway-alert.ts](../src/features/subway/model/subway-alert.ts)                         | 역·노선·방향별 반복 감시 시간과 단계별 도착 알림의 서버 저장 계약을 정의한다.                          |
| [src/features/subway/model/subway-arrival-display.ts](../src/features/subway/model/subway-arrival-display.ts)     | 실시간 열차의 표시 시간과 공식 시간표의 영업 상태를 계산한다. 화면·타이머·서버 요청에 의존하지 않는다. |
| [src/features/subway/model/use-saved-subway-station.ts](../src/features/subway/model/use-saved-subway-station.ts) | 역·노선별 즐겨찾기를 기기에 보관한다. 서버 도착정보와 분리한 사용자 설정이다.                          |
| [src/features/subway/model/use-subway-alerts.ts](../src/features/subway/model/use-subway-alerts.ts)               | 지하철 예약 알림의 Query 캐시와 저장·삭제 후 목록 동기화를 관리한다.                                   |
| [src/features/subway/model/use-subway-arrivals.ts](../src/features/subway/model/use-subway-arrivals.ts)           | 화면 포커스 동안 역별 도착정보를 15초마다 갱신하고 Query가 요청 취소·캐시를 관리하게 한다.             |
| [src/features/subway/model/use-subway-station.ts](../src/features/subway/model/use-subway-station.ts)             | 변경 주기가 다른 역 정보·시간표·시설정보를 별도 Query 키와 유효 시간으로 조회한다.                     |
| [src/features/subway/ui/subway-alerts-screen.tsx](../src/features/subway/ui/subway-alerts-screen.tsx)             | 지하철 알림 목록·편집·푸시 연결 UI. 초기 예약 초안은 라우트에서 전달받는다.                            |
| [src/features/subway/ui/subway-arrival-sheet.tsx](../src/features/subway/ui/subway-arrival-sheet.tsx)             | 선택 역의 도착정보·시간표·시설·노선도와 지도 및 알림 화면으로의 이동을 연결한다.                       |
| [src/features/subway/ui/subway-direction-card.tsx](../src/features/subway/ui/subway-direction-card.tsx)           | 한 방면의 실시간 도착 열차와 운행 상태·알림 설정 진입을 표시한다.                                      |
| [src/features/subway/ui/subway-network.tsx](../src/features/subway/ui/subway-network.tsx)                         | 인접역 이동, 가로 노선도와 전체 역 목록을 제공한다. 역 선택 상태와 모달 표시 여부는 부모가 소유한다.   |
| [src/features/subway/ui/subway-timetable-modal.tsx](../src/features/subway/ui/subway-timetable-modal.tsx)         | 선택 역·노선·요일의 전체 시간표 또는 첫차·막차를 가상 목록으로 표시한다.                               |

## 공용 코드

| 파일                                                                        | 책임                                                                                                                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/hooks/use-current-location.ts](../src/hooks/use-current-location.ts)   | foreground 현재 위치 권한·GPS 조회·중복 요청·구독 해제를 관리하는 공용 훅. 서버 데이터가 아닌 기기 센서 상태이므로 Query 캐시 대신 React state와 ref로 관리한다. |
| [src/shared/api/client.ts](../src/shared/api/client.ts)                     | 앱에서 사용하는 유일한 Axios 인스턴스. 서버 주소와 공통 타임아웃만 관리하며 기능별 응답 캐시는 Query가 소유한다.                                                 |
| [src/shared/api/config.ts](../src/shared/api/config.ts)                     | 공개 API 서버 주소 설정. 환경변수가 없으면 운영 서버를 사용하며 비밀 인증키는 다루지 않는다.                                                                     |
| [src/shared/lib/query-client.ts](../src/shared/lib/query-client.ts)         | 화면과 알림 런타임이 공유하는 서버 상태 캐시. 모듈 범위의 단일 QueryClient로 화면 전환 후에도 결과를 재사용한다.                                                 |
| [src/shared/model/app-store.ts](../src/shared/model/app-store.ts)           | 앱 전역 UI 상태인 탭 숨김 여부와 알림 런타임 오류를 관리하는 Zustand 스토어.                                                                                     |
| [src/shared/types/geo.ts](../src/shared/types/geo.ts)                       | 지도 SDK와 이동 기능이 함께 사용하는 WGS84 좌표 계약. 특정 기능이나 네이티브 SDK에 의존하지 않는다.                                                              |
| [src/shared/ui/app-button.tsx](../src/shared/ui/app-button.tsx)             | 로딩·비활성·강조 상태를 일관되게 표시하는 공통 터치 버튼.                                                                                                        |
| [src/shared/ui/app-section.tsx](../src/shared/ui/app-section.tsx)           | 제목·카드·하단 설명으로 설정 항목을 묶는 공통 레이아웃.                                                                                                          |
| [src/shared/ui/index.ts](../src/shared/ui/index.ts)                         | 공통 UI의 공개 진입점. 실제 책임은 테마·버튼·섹션 파일로 분리한다.                                                                                               |
| [src/shared/ui/map-bottom-sheet.tsx](../src/shared/ui/map-bottom-sheet.tsx) | 지도 위 시트의 공통 제스처·높이·안전 영역을 관리한다. 내부 내용이나 서버 조회는 하위 기능이 담당한다.                                                            |
| [src/shared/ui/map-design-tokens.ts](../src/shared/ui/map-design-tokens.ts) | 지도 검색·길찾기·지하철 시트가 공유하는 고정 시각 토큰. 앱 공통 테마 위에 지도 화면 전용 색상·규격을 정의한다.                                                   |
| [src/shared/ui/theme.ts](../src/shared/ui/theme.ts)                         | 앱 공통 색상·간격·글자·모서리 토큰. 컴포넌트나 서버 상태는 관리하지 않는다.                                                                                      |
| [src/shared/ui/map/map-view.tsx](../src/shared/ui/map/map-view.tsx)         | 네이버 지도 SDK에 앱의 카메라·마커·노선·현재 위치를 연결한다.                                                                                                    |

## 빌드·설정·네이티브

| 파일                                                      | 책임                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [package.json](../package.json)                           | 앱 의존성과 개발·검증·SDK 설치 명령. package-lock.json은 같은 설치 결과를 고정한다.    |
| [app.json](../app.json)                                   | Expo 앱 식별자·아이콘·권한·config plugin·실험 옵션.                                    |
| [eas.json](../eas.json)                                   | EAS 개발·프리뷰·운영 빌드 프로필과 환경.                                               |
| [.env.example](../.env.example)                           | 공개 서버 주소와 지도 SDK 빌드 키의 변수 이름만 안내. 실제 키를 커밋하지 않는다.       |
| [plugins/with-naver-map.js](../plugins/with-naver-map.js) | prebuild 시 지도 SDK 인증 설정을 생성되는 iOS·Android 프로젝트에 주입.                 |
| [eslint.config.js](../eslint.config.js)                   | Expo 기반 린트 규칙.                                                                   |
| [tsconfig.json](../tsconfig.json)                         | 별칭·엄격한 타입 검사·대상 파일 설정.                                                  |
| [.gitignore](../.gitignore)                               | 의존성·생성 네이티브 프로젝트·SDK 바이너리·비밀 환경 파일을 Git에서 제외.              |
| [AGENTS.md](../AGENTS.md)                                 | 이 저장소에서 작업하는 에이전트의 구조·검증·Git 규칙.                                  |
| [CLAUDE.md](../CLAUDE.md)                                 | 동일한 AGENTS.md 지침을 다른 에이전트에도 연결.                                        |
| [assets/images](../assets/images)                         | 앱 아이콘·스플래시와 지도 오버레이의 로컬 이미지. 마커 SVG는 PNG 편집 원본.            |
| [assets/expo.icon](../assets/expo.icon)                   | app.json에서 사용하는 iOS 앱 아이콘 원본. 폴더 이름만 보고 미사용으로 판단하지 않는다. |
