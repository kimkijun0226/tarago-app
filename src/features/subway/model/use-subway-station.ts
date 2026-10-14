import { useQuery } from '@tanstack/react-query';
import { getSubwayStation, getSubwayTimetable, getSubwayFacilities, type SubwayDayType } from '@/features/subway/api/get-subway-station';

/** 역 기본 정보는 실시간 열차가 없더라도 독립적으로 조회한다. */
export function useSubwayStation(stationName: string) {
  return useQuery({
    queryKey: ['subway', stationName, 'station'],
    queryFn: ({ signal }) => getSubwayStation(stationName, signal),
    enabled: Boolean(stationName), staleTime: 86_400_000,
  });
}
export function useSubwayTimetable(stationName: string, lineId: string, dayType: SubwayDayType, enabled = true) {
  return useQuery({
    queryKey: ['subway', stationName, lineId, 'timetable', dayType],
    queryFn: ({ signal }) => getSubwayTimetable(stationName, lineId, dayType, signal),
    enabled: enabled && Boolean(stationName) && Boolean(lineId), staleTime: 3_600_000,
  });
}

export function useSubwayFacilities(stationName: string, enabled = true) {
  return useQuery({
    queryKey: ['subway', stationName, 'facilities'],
    queryFn: ({ signal }) => getSubwayFacilities(stationName, signal),
    enabled: enabled && Boolean(stationName), staleTime: 86_400_000,
  });
}
