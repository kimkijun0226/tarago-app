import { apiClient } from '@/shared/api/client';
export type Point = { latitude: number; longitude: number };
export type Place = Point & { entrance?: Point; id: string; name: string; address: string; category: string; distanceMeters: number | null };
export type RouteStep = { mode: 'walk' | 'bus' | 'subway'; minutes: number; distanceMeters: number; startName: string; endName: string; lineNames: string[]; stationCount: number; geometry?: Point[][] };
export type Journey = { id: string; minutes: number; walkMeters: number; fare: number; transfers: number; steps: RouteStep[]; geometry: Point[][]; geometryStatus: 'available' | 'unavailable' };
export type TravelMode = 'transit' | 'bus' | 'walk';

/** 외부 서비스 키를 앱에 전달하지 않고 공통 API와 Query의 취소 신호를 사용한다. */
export async function searchPlaces(q: string, near: Point, signal?: AbortSignal): Promise<Place[]> {
  return (await apiClient.get<Place[]>('/mobility/places', { params: { q, ...near }, signal })).data;
}
export async function getDirections(start: Point & { entrance?: Point }, end: Point & { entrance?: Point }, mode: TravelMode, signal?: AbortSignal): Promise<{ paths: Journey[]; attribution: string }> {
  return (await apiClient.get('/mobility/directions', { params: { startLatitude: (start.entrance ?? start).latitude, startLongitude: (start.entrance ?? start).longitude, endLatitude: (end.entrance ?? end).latitude, endLongitude: (end.entrance ?? end).longitude, mode }, signal })).data;
}
