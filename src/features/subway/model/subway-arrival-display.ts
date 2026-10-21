/** @fileoverview 실시간 열차의 표시 시간과 공식 시간표의 영업 상태를 계산한다. 화면·타이머·서버 요청에 의존하지 않는다. */

import type { SubwayArrival } from '../api/get-subway-arrivals';
import type { SubwayTimetable } from '../api/get-subway-station';

/**
 * 전역 안내는 원문으로 유지하고 그 외에는 제공된 도착 예정 초를 분·초로 표시한다.
 * @param arrival 서버가 정규화한 열차 도착정보.
 * @param now 현재 시각의 Unix 밀리초. 운행 종료 판단에 사용할 정보 시각을 비교한다.
 * @param elapsed 서버 목록을 조회한 뒤 경과한 초.
 * @returns 도착시간과 정보의 오래됨 여부. 예정 초가 없으면 시간 문구는 비운다.
 */
export function getArrivalTime(arrival: SubwayArrival, now: number, elapsed: number) {
  const receivedAt = arrival.etaSource === 'estimated' ? arrival.etaPositionReceivedAt : arrival.receivedAt;
  const receipt = receivedAt ? Date.parse(receivedAt) : NaN;
  const stale = !Number.isFinite(receipt) || now - receipt > 120_000;
  const state = { '0': '진입', '1': '도착', '2': '출발' }[arrival.arrivalCode];
  if (state) return { text: state, stale };
  const message = arrival.arrivalMessage?.trim();
  if (message && (['3', '4', '5'].includes(arrival.arrivalCode) || /^전역\s*(진입|도착|출발)$/.test(message)))
    return { text: message, stale };
  if (arrival.etaSeconds === null || !Number.isFinite(arrival.etaSeconds))
    return { text: '', stale };

  const seconds = Math.floor(arrival.etaSeconds - elapsed);
  // 예측 시간이 소진된 것만으로 실제 도착을 확정하지 않는다.
  if (seconds <= 0) return { text: message || '', stale };
  return { text: `${Math.floor(seconds / 60)}분 ${seconds % 60}초`, stale };
}

/** 같은 방면의 일반·급행 후보를 실제 도착시간, 없으면 남은 역 수 순으로 정렬한다. */
export function getUpcomingTrains(arrivals: SubwayArrival[]) {
  const trains = arrivals.filter(arrival => arrival.arrivalCode !== '2');
  const order = (arrival: SubwayArrival) => {
    if (arrival.etaSeconds !== null && Number.isFinite(arrival.etaSeconds)) return arrival.etaSeconds;
    return ['0', '1', '3', '4', '5'].includes(arrival.arrivalCode) ? 0 : Infinity;
  };
  return [...trains].sort((a, b) => {
    const first = order(a), second = order(b);
    if (first !== second) return first - second;
    return (a.remainingStations ?? Infinity) - (b.remainingStations ?? Infinity);
  });
}

/**
 * 새벽 3시 전 시각을 전날 영업일의 연장으로 비교한다.
 * @param time HH:mm 또는 HH:mm:ss 형식의 공식 시각. 24시 이후 표기도 허용한다.
 * @returns 영업일 기준 분.
 */
function scheduleMinute(time: string) {
  /** 공식 시간표의 시·분을 숫자로 분리한다. 초 부분은 영업 상태의 분 단위 비교에 사용하지 않는다. */
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute + (hour < 3 ? 1440 : 0);
}

/**
 * 공식 첫차·막차 범위 밖일 때만 운행 전·종료를 표시한다. 시간표 부재는 도착정보 없음으로 남긴다.
 * @param direction 확인할 서버 방면 이름.
 * @param directions 공식 시간표의 방면별 열차 목록.
 * @param currentServiceMinute 한국 시간의 영업일 기준 현재 분.
 * @returns 화면에 표시할 운행 상태 문구.
 */
export function getServiceStatus(
  direction: string,
  directions: SubwayTimetable['directions'],
  currentServiceMinute: number,
) {
  /** 판정할 방면과 이름이 같은 공식 첫차·막차 자료다. */
  const scheduled = directions.find((item) => item.direction === direction);
  if (
    scheduled?.lastTrain &&
    currentServiceMinute > scheduleMinute(scheduled.lastTrain.departureTime)
  )
    return '운행종료';
  if (
    scheduled?.firstTrain &&
    currentServiceMinute < scheduleMinute(scheduled.firstTrain.departureTime)
  )
    return '운행 전';
  return '도착정보 없음';
}
