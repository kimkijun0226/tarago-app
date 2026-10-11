# TaraGo 앱

TaraGo는 주변 버스 정류장을 지도에서 찾고 도착 정보를 확인하며, 원하는 정류장과 노선의 알림을 설정하는 모바일 앱입니다.

## 구성

- React Native · Expo Development Build · TypeScript
- 네이버 지도 · TanStack Query · Axios
- 버스 정류장 지도, 노선·도착 조회, 예약 알림 및 정류장 접근 알림
- API: `https://api.tarago.cloud`

서버는 별도 비공개 `tarago-server` 저장소에서 관리합니다. 이 저장소에는 앱 코드와 개발 기록을 공개합니다. 푸시 알림은 EAS/APNs/FCM 연결이 필요합니다. 자세한 내용은 [알림 기능 문서](docs/bus-alerts.md)를 참고하세요.

## 실행

명령은 `tarago-app` 루트에서 실행합니다.

```bash
npm install
npm run start:simulator
```

무료 Apple Personal Team으로 연결한 아이폰을 테스트할 때는 다음 명령을 사용합니다. 이 빌드에서는 원격 푸시 알림이 제외됩니다.

```bash
npm run ios:device
```

푸시 권한을 포함한 일반 빌드는 유료 Apple Developer Team을 설정한 뒤 `npm run ios -- --device`로 실행합니다. 네이티브 설정이나 라이브러리가 바뀌면 개발 빌드를 다시 설치해야 합니다.

API 주소는 `EXPO_PUBLIC_API_BASE_URL`로 변경할 수 있습니다. 로컬 환경 파일과 비밀 키는 커밋하지 않습니다.

## 검증

```bash
npx tsc --noEmit
npm run lint
npm test
```
