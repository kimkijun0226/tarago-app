import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getSubwayArrivals } from '@/features/subway/api/get-subway-arrivals';

/** 선택한 지하철역의 공공 도착 정보를 시트가 열려 있는 동안 갱신한다. */
export function useSubwayArrivals(stationName: string) {
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  return useQuery({
    queryKey: ['subway', stationName, 'arrivals'],
    queryFn: ({ signal }) => getSubwayArrivals(stationName, signal),
    enabled: focused && Boolean(stationName),
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}
