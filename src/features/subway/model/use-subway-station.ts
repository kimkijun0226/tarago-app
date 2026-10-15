/** @fileoverview 변경 주기가 다른 역 정보·시간표·시설정보를 별도 Query 키와 유효 시간으로 조회한다. */

import { useQuery } from '@tanstack/react-query';
import {
  getSubwayStation,
  getSubwayTimetable,
  getSubwayFacilities,
  type SubwayDayType,
} from '@/features/subway/api/get-subway-station';

/**
 * 열차 도착정보와 독립적으로 하루 동안 재사용할 역 메타데이터를 조회한다.
 * @param stationName 빈 이름이면 요청하지 않는다.
 * @returns 역 정보 Query 결과.
 */
export function useSubwayStation(stationName: string) {
  return useQuery({
    queryKey: ['subway', stationName, 'station'],
    queryFn: ({ signal }) => getSubwayStation(stationName, signal),
    enabled: Boolean(stationName),
    staleTime: 86_400_000,
  });
}

/**
 * 선택한 영업일의 시간표를 조회하고 한 시간 동안 재사용한다.
 * @param stationName 역 이름.
 * @param lineId 빈 노선 ID이면 요청하지 않는다.
 * @param dayType 시간표의 영업일 유형.
 * @param enabled 모달이 닫혀 있을 때 요청을 막는 선택적 조건.
 * @returns 시간표 Query 결과.
 */
export function useSubwayTimetable(
  stationName: string,
  lineId: string,
  dayType: SubwayDayType,
  enabled = true,
) {
  return useQuery({
    queryKey: ['subway', stationName, lineId, 'timetable', dayType],
    queryFn: ({ signal }) => getSubwayTimetable(stationName, lineId, dayType, signal),
    enabled: enabled && Boolean(stationName) && Boolean(lineId),
    staleTime: 3_600_000,
  });
}

/**
 * 시설 조회가 필요한 화면에서 하루 동안 재사용할 공개 정보를 요청한다.
 * @param stationName 역 이름.
 * @param enabled 시설 조회 활성 여부.
 * @returns 시설정보 Query 결과.
 */
export function useSubwayFacilities(stationName: string, enabled = true) {
  return useQuery({
    queryKey: ['subway', stationName, 'facilities'],
    queryFn: ({ signal }) => getSubwayFacilities(stationName, signal),
    enabled: enabled && Boolean(stationName),
    staleTime: 86_400_000,
  });
}
