# 타라고 앱 구조

앱의 실행 계층과 상태 소유권. 개별 모듈의 책임은 [파일 목록](file-map.md)에 기술한다.

## 실행 계층

```text
Expo Router / src/app (라우트 UI·URL 파라미터 처리)
  ├─ 앱 Provider / components
  └─ features
       ├─ map       지도 화면과 선택 전환 조율
       ├─ bus-stop  정류장·노선·도착 조회
       ├─ mobility  장소 검색·앱 내부 길찾기
       ├─ bus-alert 버스 시간 예약·접근 알림·1시간 감시
       └─ subway    역 상세·시간표·도착 조회·지하철 알림
            │
            ▼
shared/api의 Axios → 타라고 서버 → 외부 공급자
```

지도 렌더링은 별도 경로다.

```text
MapScreen → shared/ui/map/MapView
  → @mj-studio/react-native-naver-map
  → NAVER Map SDK
```

## 상태 소유권

- TanStack Query: 서버 응답·로딩·오류·재시도·화면 폴링·저장 후 목록 동기화.
- React state: 해당 화면의 선택·편집·시트 높이.
- Zustand `shared/model/app-store.ts`: 앱 탭 숨김 여부와 알림 런타임 오류. 화면은 필요한 필드·액션만 selector로 구독한다.
- SecureStore: 알림 API의 기기 인증 정보.
- SQLite KV: 최근 검색·저장한 역과 접근 감지에 필요한 기기 캐시.
- 서버 Worker: 활성 요일·시간에 맞춘 버스·지하철 도착 감시와 푸시 발송. 앱이 대신 지속 폴링하지 않는다.

## 지도 책임 분리

- `app/(tabs)/index.tsx`: 지도와 시트 배치.
- `features/map/model/use-map-controller.ts`: 선택 전환과 카메라 명령 조율.
- `features/map/model/use-initial-map-position.ts`: 최초 좌표 준비와 재시도.
- `features/map/model/use-map-overlays.ts`: 표시용 마커·선 계산.
- `hooks/use-current-location.ts`: 위치 권한·GPS 구독·최근 좌표·시간 초과 처리.
- `shared/ui/map/map-view.tsx`: SDK와 React 사이의 명령·이벤트 계약.

## 데이터 공급자

- 지도: NAVER Map SDK.
- 장소 검색·보행자/대중교통 길찾기: 서버 TMAP API.
- 버스 정류장·도착·노선: 타라고 서버가 TAGO·서울·경기 등 기관 응답을 정규화.
- 지하철 실시간·역 정보·시간표·시설: 타라고 서버가 서울 공공 API 응답을 정규화.
- 푸시: 앱의 Expo Notifications와 서버 발송 계층, 최종 수신은 APNs/FCM.

관련 명세: [TMAP·지하철](tmap-and-subway.md), [버스 알림](bus-alerts.md).
앱은 외부 기관의 비밀 키를 소유하지 않는다. 네이티브 지도 SDK가 요구하는 네이버 지도 Client ID만 빌드 플러그인에서 주입한다.

## 캐시와 메모이제이션

정류장 타일은 30분 캐시를 재사용하고 이동 중에 이전 표시를 유지한다. 이는 버스 도착정보의 실시간 폴링 주기와 별개다. 도착·지하철·경로·알림은 각 기능의 Query 설정을 따른다.

`useMemo`는 표시 계산과 네이티브 입력 참조를 재사용한다. Query 캐시를 대체하지 않는다. `useRef`는 명령 인스턴스·작업 번호 같은 비표시 값을 보관한다. 자세한 선택 근거는 해당 코드 옆 JSDoc을 따른다.

## 앱 스토어

| 필드·액션              | 역할                                                   |
| ---------------------- | ------------------------------------------------------ |
| `isMapTabHidden`       | 검색·상세 시트 표시 중 하단 탭을 숨기는 상태           |
| `setMapTabHidden`      | 지도·시트·알림 진입 처리에서 숨김 여부를 변경하는 액션 |
| `alertRuntimeError`    | 접근 감지·알림 응답 처리의 최근 오류. null은 오류 없음 |
| `setAlertRuntimeError` | 런타임 오류 갱신·초기화 액션                           |

스토어는 모듈 단위로 생성되며 기기 저장소에 영구 저장하지 않는다.
`AlertRuntime`은 Query·Router 아래에서 구독을 실행하는 컴포넌트다. 상태 전달용 Provider가 아니다.
루트의 QueryClientProvider와 ThemeProvider는 외부 라이브러리의 실행 경계다.

## React 훅

| 훅            | 역할                                                   |
| ------------- | ------------------------------------------------------ |
| `useState`    | 변경 시 화면에 반영되는 컴포넌트 내부 상태             |
| `useRef`      | 렌더와 무관한 네이티브 핸들·요청 순서·처리 기록        |
| `useEffect`   | 렌더 후 구독·외부 상태 동기화와 수명 종료 시 자원 정리 |
| `useMemo`     | 의존성이 같은 표시 계산과 객체 참조 재사용             |
| `useCallback` | 의존성이 같은 이벤트·라이브러리 콜백 참조 재사용       |

메모이제이션은 계산 결과를 보관하므로 메모리 사용량 감소 자체를 의미하지 않는다.
서버 응답 재사용은 TanStack Query 캐시의 책임이며 useMemo와 별개다.
