# 타라고 TMAP 네이티브 지도 모듈

공식 TMAP Vector Map SDK 3.7을 Expo 로컬 모듈로 연결한다.
Swift/Kotlin 뷰가 직접 렌더링하며 WebView를 사용하지 않는다.

## 파일 역할

- `ios/TaragoTmapModule.swift`: iOS props·이벤트 등록과 지도 뷰.
- `android/src/main/java/expo/modules/taragotmap/TaragoTmapModule.kt`: Android props·이벤트 등록과 지도 뷰.
- `expo-module.config.json`: Expo 자동 연결에 사용할 플랫폼별 모듈 클래스.
- `ios/TaragoTmap.podspec`, `android/build.gradle`: SDK 프레임워크·AAR의 빌드 의존성.
- `install-sdk.py`: 공식 SDK 다운로드, HTTPS·체크섬·압축 경로 검증과 플랫폼별 설치.

## SDK 구성

`install-sdk.py`는 공식 배포 엔드포인트에서 유효한 다운로드 URL을 얻고 HTTPS·SHA256·압축 경로를 검증한다.
Android 산출물은 AAR, iOS 산출물은 디바이스·시뮬레이터용 XCFramework다.
iOS 프레임워크 조립에는 macOS와 Xcode가 사용된다.
EAS의 `eas-build-pre-install`은 대상 플랫폼의 SDK 복원을 실행한다. 업체 바이너리는 Git에서 제외된다.

공식 배포: [Android](https://tmapapi.tmapmobility.com/main.html#androidVSM/sample/androidSample.sdk_download), [iOS](https://tmapapi.tmapmobility.com/main.html#iosv2VSM/sample/iosSample.sdk_download).

## 인증

루트 `plugins/with-tmap.js`가 `TMAP_API_KEY`를 Info.plist와 AndroidManifest에 주입한다.
지도 SDK가 기기에서 인증하므로 이 모바일 지도 키는 바이너리에 포함된다.
서버 전용 공공데이터 키를 이 모듈에 전달하지 않는다. 키 누락·인증 실패는 `onError` 이벤트로 전달한다.

## React 연결 계약

JS 쪽 어댑터는 `src/shared/ui/tmap/tmap-view.tsx`다. 뷰 이름은 `TaragoTmap`이다.

| 입력·이벤트     | 의미                                                       |
| --------------- | ---------------------------------------------------------- |
| `initialCamera` | 최초 중심 위도·경도·줌                                     |
| `camera`        | 일련번호 `id`와 중심 좌표·줌·애니메이션 시간 또는 `bounds` |
| `padding`       | 시트와 검색창을 제외한 화면을 맞추는 논리적 point/dp 여백  |
| `markers`       | 좌표·로컬 이미지·앵커·크기·라벨·최소 줌                    |
| `lines`         | 선 ID·연속 좌표·색상·두께                                  |
| `position`      | 앱이 확인한 현재 위치 좌표 또는 null                       |
| `onReady`       | SDK 지도가 준비됨                                          |
| `onCameraIdle`  | 이동 종료 후 남서쪽 기준 좌표·위도/경도 폭·줌              |
| `onMarkerPress` | 선택한 마커 ID                                             |
| `onError`       | 지도 준비·인증·이미지 처리 오류                            |

Android는 회전을 적용한 비트맵을 캐시하고 라벨 포함 여부에 따라 앵커를 보정한다.
iOS는 실제 표시 크기로 리사이즈한 이미지와 고정 크기 현재 위치 점을 사용한다.
두 플랫폼 모두 React props 반영이 끝난 뒤 카메라와 시트 여백을 함께 적용한다.
이미지 로딩이 끝나기 전 마커를 기본 SDK 핀으로 먼저 표시하지 않는다.
