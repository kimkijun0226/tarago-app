/**
 * @fileoverview foreground 현재 위치 권한·GPS 조회·중복 요청·구독 해제를 관리하는 공용 훅.
 * 서버 데이터가 아닌 기기 센서 상태이므로 Query 캐시 대신 React state와 ref로 관리한다.
 */
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import type { Point as Coordinate } from '@/shared/types/geo';

/** 지도 카메라와 위치 오버레이에 공통으로 사용하는 WGS84 좌표. */
export type { Point as Coordinate } from '@/shared/types/geo';

/**
 * 현재 위치 권한 요청, 조회 상태, 마지막으로 얻은 좌표를 관리한다.
 *
 * 첫 화면 자동 조회와 내 위치 버튼 탭이 겹쳐도 위치 요청은 하나만 보낸다.
 */
export function useCurrentLocation() {
  /** 첫 화면과 내 위치 버튼의 동시 요청을 막는 잠금. 잠금 자체는 표시하지 않아 ref에 저장한다. */
  const requestingRef = useRef(false);

  /** 최근 GPS 측정의 원본 정확도·시각을 보관한다. 지도에 표시할 좌표는 별도 position state가 담당한다. */
  const recent = useRef<Location.LocationObject | null>(null);

  /** 진행 중인 GPS 구독을 중지하는 함수. 수명 정리용 핸들은 재렌더가 필요 없어 ref를 쓴다. */
  const stopRefresh = useRef<(() => void) | null>(null);

  /** 늦게 끝난 비동기 작업이 언마운트 뒤 로딩·좌표 상태를 변경하지 않도록 확인하는 수명 플래그. */
  const mounted = useRef(true);

  /** 위치 요청이 진행 중인지 나타낸다. 현재 위치 버튼의 중복 탭과 로딩 표시를 제어한다. */
  const [loading, setLoading] = useState(false);

  /** 마지막으로 정확도를 확인한 좌표와 변경 함수다. 지도 위치 점을 갱신한다. */
  const [position, setPosition] = useState<Coordinate | null>(null);

  /** 훅 수명 동안 비동기 상태 반영을 허용한다. 언마운트 시 플래그를 내리고 진행 중 GPS 구독을 취소해 자원을 해제한다. */
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopRefresh.current?.();
    };
  }, []);

  /**
   * 취소 가능한 위치 구독으로 8초 내에 정확한 새 좌표를 기다린다.
   * 상위 getCurrentLocation의 안정적인 의존성을 위해 useCallback을 사용한다.
   * 시간·정확도 비교와 좌표 객체 생성은 요청 이벤트에서만 실행되어 useMemo를 쓰지 않는다.
   * @returns 허용 정확도를 만족하는 WGS84 좌표. 취소·실패·시간 초과 시 reject된다.
   */
  const refresh = useCallback(
    () =>
      new Promise<Coordinate>((resolve, reject) => {
        stopRefresh.current?.();

        /** 구독 성공·실패·취소가 겹쳐도 Promise를 한 번만 완료하도록 막는 지역 플래그다. */
        let finished = false;

        /** 새 GPS 측정을 받는 네이티브 구독 핸들이다. 요청 종료 시 remove로 해제한다. */
        let subscription: Location.LocationSubscription | undefined;

        /** 성공·실패·시간 초과 중 최초 결과만 처리하고 타이머와 위치 구독을 해제한다. */
        const finish = (error?: Error, location?: Location.LocationObject) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          subscription?.remove();
          stopRefresh.current = null;
          if (error) reject(error);
          else if (location) {
            recent.current = location;

            /** 지도에서 사용할 위도·경도만 원본 위치 객체에서 추출한 값이다. */
            const coordinate = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };
            if (mounted.current) setPosition(coordinate);
            resolve(coordinate);
          }
        };

        /** GPS가 응답하지 않아도 8초 뒤 구독을 종료할 시간 초과 작업이다. */
        const timer = setTimeout(
          () => finish(new Error('현재 위치 조회 시간이 초과되었습니다.')),
          8_000,
        );
        stopRefresh.current = () => finish(new Error('위치 조회가 취소되었습니다.'));
        void Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 1000 },
          (location) => {
            if (
              Date.now() - location.timestamp > 15_000 ||
              !Number.isFinite(location.coords.latitude) ||
              !Number.isFinite(location.coords.longitude)
            )
              return;
            if (
              location.coords.accuracy == null ||
              location.coords.accuracy < 0 ||
              location.coords.accuracy > 100
            )
              return;
            finish(undefined, location);
          },
          (reason) => finish(new Error(reason)),
        )
          .then((value) => {
            subscription = value;
            if (finished) value.remove();
          })
          .catch((error) => finish(error instanceof Error ? error : new Error(String(error))));
      }),
    [],
  );

  /**
   * foreground 권한과 기기 위치 서비스 상태를 확인한 뒤 현재 좌표를 조회한다.
   *
   * 5초 이내의 정확한 좌표만 재사용하고 새 GPS 측정은 High 정확도로 기다린다. 실패 이유는
   * 콘솔에 남기고 사용자에게는 위치 설정 확인 안내를 보여 준다.
   * 초기 위치 준비 effect에서 호출하므로 참조를 유지하기 위해 useCallback을 쓴다.
   * @returns 조회한 WGS84 좌표. 권한 거부·서비스 비활성화·조회 오류·중복 요청이면 `null`.
   */
  const getCurrentLocation = useCallback(async (): Promise<Coordinate | null> => {
    /** 첫 화면 조회와 버튼 탭이 겹쳐도 위치 요청은 한 번만 실행한다. */
    if (requestingRef.current) return null;

    requestingRef.current = true;
    setLoading(true);

    try {
      /** 기기의 현재 foreground 위치 권한과 다시 요청할 수 있는지 여부다. */
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain)
        permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          '위치 권한이 필요해요',
          permission.canAskAgain
            ? '위치 권한을 허용하면 내 위치로 이동할 수 있어요.'
            : '기기 설정에서 TaraGo의 위치 권한을 허용해주세요.',
        );
        return null;
      }

      if (permission.ios?.accuracy === 'reduced' || permission.android?.accuracy === 'coarse') {
        Alert.alert(
          '정확한 위치를 켜주세요',
          '기기 설정에서 TaraGo의 정확한 위치를 허용해주세요.',
          [
            { text: '취소', style: 'cancel' },
            {
              text: '설정 열기',
              onPress: () => {
                void Linking.openSettings().catch(() =>
                  Alert.alert('기기 설정에서 위치 권한을 확인해주세요.'),
                );
              },
            },
          ],
        );
        return null;
      }

      if (!(await Location.hasServicesEnabledAsync())) {
        Alert.alert('위치 서비스가 꺼져 있어요', '기기의 위치 서비스를 켜주세요.');
        return null;
      }

      /** 최근 5초·허용 정확도 조건을 만족하는 위치 측정값이다. 없으면 새 GPS 구독을 기다린다. */
      const location =
        recent.current &&
        Date.now() - recent.current.timestamp < 5_000 &&
        recent.current.coords.accuracy != null &&
        recent.current.coords.accuracy >= 0 &&
        recent.current.coords.accuracy <= 50
          ? recent.current
          : await Location.getLastKnownPositionAsync({ maxAge: 5_000, requiredAccuracy: 50 });
      if (!location) return await refresh();

      /** 지도에서 사용할 위도·경도만 원본 위치 객체에서 추출한 값이다. */
      const coordinate = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setPosition(coordinate);
      recent.current = location;
      return coordinate;
    } catch (error) {
      console.warn('현재 위치 조회 실패:', error);
      Alert.alert(
        '위치를 찾지 못했어요',
        '기기 설정에서 정확한 위치를 켜고 내 위치 버튼을 다시 눌러주세요.',
      );
      return null;
    } finally {
      requestingRef.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [refresh]);

  return { getCurrentLocation, loading, position };
}
