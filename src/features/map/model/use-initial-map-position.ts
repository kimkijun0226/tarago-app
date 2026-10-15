/** @fileoverview 지도 최초 진입 좌표의 준비 상태를 관리한다. 알림 좌표를 우선하고 없으면 현재 위치를 조회한다. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coordinate } from '@/hooks/use-current-location';

type InitialPositionParams = { notificationId?: string; latitude?: string; longitude?: string };

/**
 * 초기 카메라 좌표와 위치 재시도 동작을 제공한다.
 * @param params 알림을 눌러 진입했을 때 전달된 좌표 문자열.
 * @param getCurrentLocation 권한과 정확도를 확인하는 공용 위치 조회 함수.
 * @returns 지도 생성에 사용할 좌표, 준비 중 여부, 재시도 함수.
 */
export function useInitialMapPosition(
  params: InitialPositionParams,
  getCurrentLocation: () => Promise<Coordinate | null>,
) {
  /** 최초 지도 카메라의 좌표와 변경 함수다. null인 동안 지도 대신 위치 준비 화면을 표시한다. */
  const [initialPosition, setInitialPosition] = useState<Coordinate | null>(null);

  /** 최초 좌표를 읽는 중인지 나타낸다. 로딩 안내와 재시도 화면을 구분한다. */
  const [preparingLocation, setPreparingLocation] = useState(true);

  /** 같은 훅 인스턴스의 effect 재실행에서 자동 조회를 중복 요청하지 않는다. 화면에 표시하지 않는 실행 여부라 ref를 쓴다. */
  const startupRequested = useRef(false);

  /**
   * 유효한 알림 좌표 또는 현재 GPS 좌표를 준비한다.
   * effect의 의존성과 재시도 버튼에서 공유하므로 useCallback으로 참조를 유지한다.
   * 숫자 변환·범위 비교는 한 번의 조회에만 필요한 작은 계산이어서 useMemo를 쓰지 않는다.
   */
  const prepareInitialPosition = useCallback(async () => {
    setPreparingLocation(true);
    try {
      /** 알림 파라미터의 위도를 숫자로 변환한 값이다. */
      const latitude = Number(params.latitude);

      /** 알림 파라미터의 경도를 숫자로 변환한 값이다. */
      const longitude = Number(params.longitude);
      if (
        params.notificationId &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
      ) {
        setInitialPosition({ latitude, longitude });
        return;
      }

      /** 권한 확인을 거쳐 현재 위치 훅이 반환한 GPS 좌표다. */
      const coordinate = await getCurrentLocation();
      if (coordinate) setInitialPosition(coordinate);
    } finally {
      setPreparingLocation(false);
    }
  }, [getCurrentLocation, params.notificationId, params.latitude, params.longitude]);

  /** 훅 진입 시 최초 좌표 준비를 요청한다. prepareInitialPosition 참조가 바뀌어도 실행 플래그로 자동 중복 요청을 막으며 재시도는 별도 버튼에서 실행한다. */
  useEffect(() => {
    if (startupRequested.current) return;
    startupRequested.current = true;
    void prepareInitialPosition();
  }, [prepareInitialPosition]);

  return { initialPosition, preparingLocation, prepareInitialPosition };
}
