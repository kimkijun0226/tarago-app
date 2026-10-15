/** @fileoverview 실시간 열차의 표시 시간과 공식 시간표의 영업 상태를 계산한다. 화면·타이머·서버 요청에 의존하지 않는다. */

import type { SubwayArrival } from '../api/get-subway-arrivals';
import type { SubwayTimetable } from '../api/get-subway-station';

/**
 * 서버 수신 시각이 2분 넘게 지난 정보는 카운트다운 대신 갱신 지연을 표시한다.
 * @param arrival 서버가 정규화한 열차 도착정보.
 * @param now 현재 시각의 Unix 밀리초.
 * @param elapsed 서버 목록을 조회한 뒤 경과한 초.
 * @returns 표시 문구와 오래된 정보 여부.
 */
export function getArrivalTime(arrival: SubwayArrival, now: number, elapsed: number) {
  /** 열차별 서버 수신 시각을 밀리초로 변환한다. 없거나 잘못된 시각은 지연 정보로 취급한다. */
  const receipt = arrival.receivedAt ? Date.parse(arrival.receivedAt) : NaN;
  if (!Number.isFinite(receipt) || now - receipt > 120_000)
    return { text: '갱신 지연', stale: true };

  /** 목록 조회 후 흐른 시간을 빼서 음수가 되지 않도록 보정한 남은 도착 초다. */
  const seconds = arrival.etaSeconds === null ? null : Math.max(0, arrival.etaSeconds - elapsed);
  return {
    text:
      seconds !== null && Number.isFinite(seconds) && seconds > 0
        ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초`
        : arrival.arrivalMessage || '시간 확인 중',
    stale: false,
  };
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
