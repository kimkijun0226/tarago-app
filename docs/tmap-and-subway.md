# TMAP 지도·검색·길찾기와 지하철 공공데이터

지도 렌더링은 TMAP Vector Map SDK 3.7의 Android/iOS 네이티브 뷰를 사용한다.
WebView로 지도를 대체하지 않는다. 정류장과 선택 장소, 노선·길찾기 경로만 표시하고 버스 차량 위치는 지도에 표시하지 않는다.

## 키 설정

서버 `.env.local`:

- `TMAP_API_KEY`: 장소/주소 검색·보행자 경로·대중교통 **전체 경로** 상품을 모두 활성화한 앱 키. 검색과 모든 길찾기에 같은 변수를 사용한다. 대중교통 요약 API가 아니다.
- `SEOUL_SUBWAY_REALTIME_ARRIVAL_API_KEY`: 서울 열린데이터광장 지하철 실시간 도착정보 전용 키.

앱 `.env.local` 및 EAS의 각 빌드 환경에도 같은 `TMAP_API_KEY`를 설정한다.
Config plugin이 지도 SDK 인증을 위해 Info.plist와 AndroidManifest에 주입한다.
지도 SDK는 기기에서 인증하므로 앱 키가 바이너리에 포함된다. 서버의 다른 인증키는 앱에 넣지 않는다.

키 값은 Git에 커밋하지 않는다. Kakao와 ODsay 키는 실행 경로에서 더 이상 사용하지 않는다.

## 새 네이티브 빌드

TMAP 공식 SDK 바이너리는 Git에 포함하지 않는다. EAS의 `eas-build-pre-install`이 고정된 3.7 SDK를 설치한다.
iOS SDK는 Swift 6.3.3으로 배포되어 Xcode 27 빌드 이미지를 지정했다.
로컬 빌드는 SDK 설치 후 Expo prebuild를 실행한다.

```sh
npm run tmap:sdk -- ios
npx expo prebuild --platform ios
```

Android는 `npm run tmap:sdk -- android` 후 해당 플랫폼 prebuild를 사용한다.
이전 앱 빌드에는 TMAP 모듈이 없으므로 Metro 새로고침/OTA만으로 교체할 수 없다.

## 데이터 흐름

- `/mobility/places`: TMAP 통합 POI 검색. 앱은 Query 캐시와 요청 취소를 사용한다.
- `/mobility/directions`: TMAP 대중교통/보행자 경로. 공급자가 제공한 구간 좌표를 함께 반환한다.
- ODsay `/mobility/geometry` 호출은 제거했다.
- `/subway/arrivals?stationName=역곡`: 서울시 실시간 도착정보. 서버에서 15초 캐시·동일 요청 병합을 적용한다.
- 장소의 지하철 실시간 도착 버튼 또는 길찾기의 지하철 승차역 버튼에서 도착정보 시트를 연다.
- 지하철 Query는 선택한 역의 시트가 열린 지도 화면에서만 갱신하며 앱이 백그라운드로 가면 폴링을 중지한다.
- 공공데이터 `recptnDt`를 한국 시간으로 해석해 남은 시간을 보정하며, 오래된 응답을 도착 확정으로 표시하지 않는다.

## 제공 범위와 검증 제한

TMAP 대중교통 요청에는 버스 전용 검색 필터가 없어 최대 10개 응답 중 버스·도보만 포함한 경로를 필터링한다.
버스 경로가 없다는 결과는 버스만 사용하는 모든 조합이 존재하지 않는다는 보장이 아니다.
기차·항공·해운 등 앱에서 표현하지 않는 이동수단은 도보로 변환하지 않는다.

지하철 공공데이터는 공급자가 제공하는 역만 지원하며 전국 모든 역을 보장하지 않는다.
공식 문서의 HTTP 서버를 백엔드에서 호출하고, 앱에서 타라고 서버로의 통신은 HTTPS를 유지한다.
지하철 푸시 알림 예약 기능은 이번 데이터 조회 연결과 별개로 아직 추가하지 않았다.

2026-10-14 기존 지하철 전용 키로 실제 역곡역 응답을 받아 서버 정규화까지 확인했다.
같은 TMAP_API_KEY로 실제 장소 검색 20건, 도보 경로 1개, 대중교통 경로 10개 및 경로 좌표 수신을 확인했다. Android 에뮬레이터에서 지도 SDK 인증·지도 표시·정류장 선택 시트를 확인했다. iPhone 실기기는 새 빌드 설치 후 확인해야 한다.

공식 문서:
- https://tmapapi.tmapmobility.com/main.html
- https://transit.tmapmobility.com/docs/routes
- https://data.seoul.go.kr/dataList/OA-12764/A/1/datasetView.do
- https://docs.expo.dev/build-reference/infrastructure/
