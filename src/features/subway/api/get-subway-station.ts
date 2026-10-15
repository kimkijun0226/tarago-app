/** @fileoverview 역·노선 메타데이터, 영업일 시간표, 공개 시설정보의 서버 계약과 요청을 정의한다. */

import { apiClient } from '@/shared/api/client';

/** 공식 시간표의 영업일 구분. */
export type SubwayDayType = 'weekday' | 'saturday' | 'holiday';
/** 노선도에 표시할 공식 역 코드·역 이름·역 번호. */
export interface SubwayStationNode {
  stationCode: string;
  name: string;
  stationNumber: string;
}
/** 선택 역이 속한 노선과 인접역·종착역·전체 역 목록. */
export interface SubwayStationLine {
  lineId: string;
  lineName: string;
  color?: string;
  stationCode: string;
  stationNumber: string;
  previousStation: SubwayStationNode | null;
  nextStation: SubwayStationNode | null;
  terminals: string[];
  stations: SubwayStationNode[];
}
/** 실시간 열차와 독립적으로 제공되는 역 메타데이터. */
export interface SubwayStationDetail {
  stationName: string;
  attribution: string;
  lines: SubwayStationLine[];
}
/** 공식 시간표의 열차. departureTime은 영업일 기준이므로 24시 이후 표기가 가능하다. */
export interface SubwayScheduledTrain {
  trainId: string;
  arrivalTime: string | null;
  departureTime: string;
  destination: string;
  origin: string;
  isExpress: boolean;
}
/** 역·노선·영업일별 방면 시간표와 같은 자료에서 계산한 첫차·막차. */
export interface SubwayTimetable {
  stationName: string;
  lineId: string;
  lineName: string;
  dayType: SubwayDayType;
  attribution: string;
  directions: {
    direction: string;
    firstTrain: SubwayScheduledTrain | null;
    lastTrain: SubwayScheduledTrain | null;
    trains: SubwayScheduledTrain[];
  }[];
}

/**
 * 실시간 열차 유무와 관계없이 공식 역·노선 정보를 조회한다.
 * @param stationName 조회할 역 이름.
 * @param signal Query의 요청 취소 신호.
 * @returns 인접역·종착역·역간 목록을 포함한 역 정보.
 */
export async function getSubwayStation(
  stationName: string,
  signal?: AbortSignal,
): Promise<SubwayStationDetail> {
  /** HTTP 응답 래퍼에서 화면에 전달할 서버 본문만 꺼낸다. */
  const { data } = await apiClient.get<SubwayStationDetail>('/subway/station', {
    params: { stationName },
    signal,
  });
  return data;
}

/**
 * 역·노선·영업일 유형에 해당하는 공식 시간표를 조회한다.
 * @param stationName 역 이름.
 * @param lineId 서버 노선 식별자.
 * @param dayType 평일·토요일·휴일 구분.
 * @param signal Query의 요청 취소 신호.
 * @returns 방면별 열차와 첫차·막차.
 */
export async function getSubwayTimetable(
  stationName: string,
  lineId: string,
  dayType: SubwayDayType,
  signal?: AbortSignal,
): Promise<SubwayTimetable> {
  /** HTTP 응답 래퍼에서 화면에 전달할 서버 본문만 꺼낸다. */
  const { data } = await apiClient.get<SubwayTimetable>('/subway/timetable', {
    params: { stationName, lineId, dayType },
    signal,
  });
  return data;
}

/** 현재 운행 여부를 포함하지 않는 공개 연락처·엘리베이터 위치와 자료 기준 연도. */
export interface SubwayStationFacilities {
  stationName: string;
  attribution: string;
  elevatorSourceYear: number;
  contacts: { lineName: string; address: string; phone: string }[];
  elevators: { id: string; latitude: number; longitude: number }[];
}

/**
 * 현재 가동 여부를 추정하지 않고 공개 연락처와 엘리베이터 위치만 조회한다.
 * @param stationName 조회할 역 이름.
 * @param signal Query의 요청 취소 신호.
 * @returns 시설 위치와 자료 기준 연도·출처.
 */
export async function getSubwayFacilities(
  stationName: string,
  signal?: AbortSignal,
): Promise<SubwayStationFacilities> {
  /** HTTP 응답 래퍼에서 화면에 전달할 서버 본문만 꺼낸다. */
  const { data } = await apiClient.get<SubwayStationFacilities>('/subway/facilities', {
    params: { stationName },
    signal,
  });
  return data;
}
