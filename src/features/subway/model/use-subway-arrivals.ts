/** @fileoverview 화면 포커스 동안 역별 도착정보를 15초마다 갱신하고 Query가 요청 취소·캐시를 관리하게 한다. */

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getSubwayArrivals } from '@/features/subway/api/get-subway-arrivals';

/**
 * 선택 역의 도착정보를 화면 포커스 동안 갱신한다.
 * @param stationName 빈 이름이면 요청하지 않는다.
 * @returns 로딩·오류·도착정보·재조회 기능을 포함한 Query 결과.
 */
export function useSubwayArrivals(stationName: string) {
  /** 현재 Router 화면의 포커스 여부다. 화면이 보일 때만 도착 Query를 활성화한다. */
  const [focused, setFocused] = useState(false);
  /** 빈 의존성의 useCallback으로 포커스 구독 함수를 유지해 재렌더마다 정리를 반복하지 않는다. 포커스 시 focused를 켜고 blur·언마운트 cleanup에서 꺼 도착 Query를 중지한다. */
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return useQuery({
    queryKey: ['subway', stationName, 'arrivals'],
    queryFn: ({ signal }) => getSubwayArrivals(stationName, signal),
    enabled: focused && Boolean(stationName),
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}
