# 지도 검색·길찾기와 공통 UI

## 적용한 흐름

네이버지도 Android 6.11.2.2에서 실제 장소 검색, 장소의 출발·도착 지정,
현재 위치 출발, 교환 버튼, 대중교통 결과 카드와 시트 전환을 관찰했다.
REA 클래스 근거와 화면 관찰 기록은 `/tmp/tarago-android-analysis/naver-search-directions-report.md`에 있다.
관찰한 흐름을 타라고 코드로 구현했으며 네이버의 서버 알고리즘이나 비공개 API를 복제하지 않았다.

- 일반 검색은 장소·주소 검색이다. 기존 정류장 전용 검색창을 대체했다.
- 최근 선택 장소는 기기 SQLite에 최대 10개 보관하고 사용자가 지울 수 있다.
- 출발·도착 편집, 교환, 현재 위치 선택과 대중교통·버스·도보 모드를 제공한다.
- 소요 시간·환승·요금·도보 거리·승하차 순서를 앱에서 표시한다.
- 지도 선은 공급자의 실제 도로/노선 형상만 사용한다. 없는 도로를 직선으로 만들지 않는다.
- 경로 목록과 정류장 목록은 공통 제스처 시트를 사용한다.

## UI 기준

`src/shared/ui/design-system.tsx`가 라이트·다크 색상, 글자, 간격, 모서리,
공통 버튼과 그룹 섹션의 기준이다. Apple HIG를 참고한 React Native UI이며
공식 Apple UI 라이브러리 자체를 가져온 것은 아니다.
탭·스위치·시간 선택기는 기존 네이티브 구성요소를 유지한다.
지도·알림 화면과 시트의 텍스트, 터치 영역, 경고와 설정 그룹에 이 기준을 적용했다.

## 서버 연결에 필요한 항목

앱에는 키를 넣지 않는다. 서버 `.env.local`에 다음 변수를 설정한다.

| 변수 | 용도 | 발급/설정 |
| --- | --- | --- |
| `KAKAO_REST_API_KEY` | 장소·주소 검색 | Kakao Developers, Local API를 사용할 수 있는 REST API 키 |
| `ODSAY_API_KEY` | 버스·대중교통 경로와 노선 형상 | ODsay 서버용 애플리케이션 등록 및 서버 IP 허용 |
| `TMAP_API_KEY` | 실제 도보 도로 경로 | SK Open API 보행자 경로 사용 가능 앱 키 |
| `PUBLIC_DATA_SERVICE_KEY` | TAGO 경유 정류장·차량 좌표 | 공공데이터포털 TAGO 버스노선정보 및 버스위치정보 사용 등록 |

서버 `/mobility/capabilities`는 연결 설정 여부만 반환한다. 키 값은 반환하지 않는다.
미설정 API는 503과 안내 문구를 반환한다. 설정 여부가 실제 외부 API의 사용 승인 성공을 보장하지 않는다.

## 현재 확인한 한계

- 로컬 서버에는 신규 검색·길찾기 세 키가 없다. 실제 검색 결과·경로 조회는 미검증이다.
- TAGO는 기존 키로 HTTP 403 및 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(30)를 반환했다.
- 경기도 GBIS 위치 API에는 실제 좌표가 없고 정류장 순번만 있다. 해당 정보는 시트에만 표시한다.
- TAGO 사용 등록만으로 경기도 52번·12번의 좌표 제공이 보장되지 않는다. 지원 지역·원본 노선 ID 확인 또는 승인된 별도 좌표 공급이 필요하다.
- TAGO가 제공하는 유효한 맵매칭 WGS84 좌표만 지도에 표시한다. 정류장 사이 추정 좌표는 생성하지 않는다.
- 도시 내 대중교통 경로만 지원한다. 도시간 연결, 자동차·자전거, 즐겨찾기,
  출발 시각 변경·실시간 길 안내 및 네이버 전체 기능·성능 동등성은 구현/검증하지 않았다.
- Android 에뮬레이터에서 지도·알림 화면 표시를 확인했지만 iPhone의 새 UI와 실제 푸시 액션은 미확인이다.

## 참고 문서

- https://developer.apple.com/design/human-interface-guidelines
- https://developers.kakao.com/docs/ko/local/dev-guide
- https://lab.odsay.com/guide/releaseReference?platform=web
- https://tmap-skopenapi.readme.io/reference/보행자-경로안내
- https://www.gbis.go.kr/gbis2014/publicService.action?cmd=mBusLocation
- https://www.data.go.kr/data/15098533/openapi.do
