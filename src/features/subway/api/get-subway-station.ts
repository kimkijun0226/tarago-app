import { apiClient } from '@/shared/api/client';

export type SubwayDayType = 'weekday' | 'saturday' | 'holiday';
export interface SubwayStationNode { stationCode: string; name: string; stationNumber: string }
export interface SubwayStationLine {
  lineId: string; lineName: string; color?: string; stationCode: string; stationNumber: string;
  previousStation: SubwayStationNode | null; nextStation: SubwayStationNode | null;
  terminals: string[]; stations: SubwayStationNode[];
}
export interface SubwayStationDetail { stationName: string; attribution: string; lines: SubwayStationLine[] }
export interface SubwayScheduledTrain {
  trainId: string; arrivalTime: string | null; departureTime: string;
  destination: string; origin: string; isExpress: boolean;
}
export interface SubwayTimetable {
  stationName: string; lineId: string; lineName: string; dayType: SubwayDayType; attribution: string;
  directions: { direction: string; firstTrain: SubwayScheduledTrain | null; lastTrain: SubwayScheduledTrain | null; trains: SubwayScheduledTrain[] }[];
}

/** 공공 역번호·열차 시간표는 서버에서 조회하고 앱은 응답만 표시한다. */
export async function getSubwayStation(stationName: string, signal?: AbortSignal): Promise<SubwayStationDetail> {
  const { data } = await apiClient.get<SubwayStationDetail>('/subway/station', { params: { stationName }, signal });
  return data;
}
export async function getSubwayTimetable(stationName: string, lineId: string, dayType: SubwayDayType, signal?: AbortSignal): Promise<SubwayTimetable> {
  const { data } = await apiClient.get<SubwayTimetable>('/subway/timetable', { params: { stationName, lineId, dayType }, signal });
  return data;
}

export interface SubwayStationFacilities {
  stationName: string; attribution: string; elevatorSourceYear: number;
  contacts: { lineName: string; address: string; phone: string }[];
  elevators: { id: string; latitude: number; longitude: number }[];
}
/** 시설 가동 여부는 추정하지 않고 공개된 연락처와 위치만 조회한다. */
export async function getSubwayFacilities(stationName: string, signal?: AbortSignal): Promise<SubwayStationFacilities> {
  const { data } = await apiClient.get<SubwayStationFacilities>('/subway/facilities', { params: { stationName }, signal });
  return data;
}
