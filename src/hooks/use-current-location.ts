import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

/** 네이버 지도 카메라와 위치 오버레이에 공통으로 사용하는 WGS84 좌표. */
export type Coordinate = {
  latitude: number;
  longitude: number;
};

/**
 * 현재 위치 권한 요청, 조회 상태, 마지막으로 얻은 좌표를 관리한다.
 *
 * 첫 화면 자동 조회와 내 위치 버튼 탭이 겹쳐도 위치 요청은 하나만 보낸다.
 */
export function useCurrentLocation() {
  const requestingRef = useRef(false);
  const recent = useRef<Location.LocationObject | null>(null);
  const stopRefresh = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<Coordinate | null>(null);
  useEffect(() => {mounted.current=true;return () => {mounted.current=false;stopRefresh.current?.();};}, []);

  /** 취소 가능한 위치 구독을 사용해 GPS가 응답하지 않아도 기다림을 종료한다. */
  const refresh = useCallback(() => new Promise<Coordinate>((resolve,reject) => {
    stopRefresh.current?.();
    let finished=false;
    let subscription:Location.LocationSubscription|undefined;
    const finish = (error?:Error,location?:Location.LocationObject) => {
      if (finished) return;
      finished=true;clearTimeout(timer);subscription?.remove();stopRefresh.current=null;
      if (error) reject(error);
      else if (location) {
        recent.current=location;
        const coordinate={latitude:location.coords.latitude,longitude:location.coords.longitude};
        if (mounted.current) setPosition(coordinate);
        resolve(coordinate);
      }
    };
    const timer=setTimeout(()=>finish(new Error('현재 위치 조회 시간이 초과되었습니다.')),8_000);
    stopRefresh.current=()=>finish(new Error('위치 조회가 취소되었습니다.'));
    void Location.watchPositionAsync({accuracy:Location.Accuracy.Balanced,distanceInterval:0,timeInterval:1000},
      location=>finish(undefined,location),reason=>finish(new Error(reason)))
      .then(value=>{subscription=value;if(finished)value.remove();})
      .catch(error=>finish(error instanceof Error ? error : new Error(String(error))));
  }),[]);

  /**
   * foreground 권한과 기기 위치 서비스 상태를 확인한 뒤 현재 좌표를 조회한다.
   *
   * 유효한 최근 좌표를 먼저 사용하고 Balanced 정확도로 보정한다. 실패 이유는
   * 콘솔에 남기고 사용자에게는 위치 설정 확인 안내를 보여 준다.
   * @returns 조회한 WGS84 좌표. 권한 거부·서비스 비활성화·조회 오류·중복 요청이면 `null`.
   */
  const getCurrentLocation = useCallback(async (): Promise<Coordinate | null> => {
    /** 첫 화면 조회와 버튼 탭이 겹쳐도 위치 요청은 한 번만 실행한다. */
    if (requestingRef.current) return null;

    requestingRef.current = true;
    setLoading(true);

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission=await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          '위치 권한이 필요해요',
          permission.canAskAgain
            ? '위치 권한을 허용하면 내 위치로 이동할 수 있어요.'
            : '기기 설정에서 TaraGo의 위치 권한을 허용해주세요.',
        );
        return null;
      }

      if (!(await Location.hasServicesEnabledAsync())) {
        Alert.alert('위치 서비스가 꺼져 있어요', '기기의 위치 서비스를 켜주세요.');
        return null;
      }

      const location = recent.current && Date.now()-recent.current.timestamp<15_000
        ? recent.current : await Location.getLastKnownPositionAsync({maxAge:60_000,requiredAccuracy:100});
      if (!location) return await refresh();
      const coordinate = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setPosition(coordinate);
      recent.current=location;
      // 최근 좌표로 먼저 이동하고, 새 GPS 결과는 위치 표시만 보정한다.
      void refresh().catch(error=>console.warn('현재 위치 보정 실패:',error));
      return coordinate;
    } catch (error) {
      console.warn('현재 위치 조회 실패:', error);
      Alert.alert(
        '위치를 찾지 못했어요',
        '위치 설정을 확인하고 내 위치 버튼을 다시 눌러주세요.',
      );
      return null;
    } finally {
      requestingRef.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [refresh]);

  return { getCurrentLocation, loading, position };
}
