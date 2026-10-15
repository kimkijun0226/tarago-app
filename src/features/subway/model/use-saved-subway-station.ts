/** @fileoverview 역·노선별 즐겨찾기를 기기에 보관한다. 서버 도착정보와 분리한 사용자 설정이다. */

import { useEffect, useRef, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';

/** 역·노선별 즐겨찾기 키를 다른 기기 설정과 구분하는 접두어다. */
const PREFIX = 'tarago-saved-subway:';

/**
 * 기존 역별 저장 키 중 활성 값만 읽어 내 장소 목록을 구성한다.
 * @returns 저장한 역 이름과 노선 이름 목록.
 */
export async function readSavedSubwayStations(): Promise<
  { stationName: string; lineName: string }[]
> {
  /** 저장소의 전체 키 중 기존 역 즐겨찾기 접두어로 시작하는 키만 남긴다. */
  const keys = (await Storage.getAllKeys()).filter((key) => key.startsWith(PREFIX));

  /** 즐겨찾기 키의 값을 병렬로 읽되 역·노선을 해석할 원본 키도 함께 유지한다. */
  const values = await Promise.all(
    keys.map(async (key) => ({ key, value: await Storage.getItem(key) })),
  );
  return values.flatMap(({ key, value }) => {
    /** 기존 저장 키의 접두어를 제외하고 역 이름과 노선 이름을 복원한다. */
    const [stationName, lineName] = key.slice(PREFIX.length).split(':');
    return value === '1' && stationName && lineName ? [{ stationName, lineName }] : [];
  });
}

/**
 * 역·노선별 저장 상태와 비동기 전환을 관리한다. 서버 데이터는 보관하지 않는다.
 * @param stationName 저장 대상 역.
 * @param lineName 같은 역을 구분할 노선.
 * @returns 저장 여부, 전환 함수, 처리 중 여부와 오류 문구.
 */
export function useSavedSubwayStation(stationName: string, lineName: string) {
  /** 현재 역과 노선을 식별하는 즐겨찾기 저장 키다. */
  const key = `${PREFIX}${stationName}:${lineName}`;

  /** 읽거나 저장한 key와 즐겨찾기 여부를 함께 보관해 역 변경 직후 이전 값을 표시하지 않게 한다. */
  const [saved, setSaved] = useState<{ key: string; value: boolean }>({ key: '', value: false });

  /** 즐겨찾기 조회 또는 저장 실패 안내 문구다. */
  const [error, setError] = useState('');

  /** 즐겨찾기 쓰기 진행 중임을 표시해 저장 버튼을 비활성화한다. */
  const [busy, setBusy] = useState(false);

  /** 저장 완료 시점의 선택 역을 확인한다. 이전 역의 비동기 완료가 현재 역의 저장 표시를 바꾸지 않게 한다. */
  const currentKey = useRef(key);

  /** 역·노선 key가 바뀌면 최신 키를 ref에 기록하고 즐겨찾기를 다시 읽는다. cleanup에서 이전 조회의 active를 내려 이전 역 결과를 무시한다. */
  useEffect(() => {
    currentKey.current = key;

    /** 역·노선 변경이나 언마운트 후 이전 저장소 조회 결과가 반영되지 않도록 막는다. */
    let active = true;
    Storage.getItem(key)
      .then((value) => {
        if (active) setSaved({ key, value: value === '1' });
      })
      .catch(() => {
        if (active) setError('저장한 역 정보를 불러오지 못했습니다.');
      });
    return () => {
      active = false;
    };
  }, [key]);

  /** 읽은 키가 현재 키와 일치할 때만 유효한 즐겨찾기 여부다. */
  const value = saved.key === key && saved.value;

  /** 현재 역의 즐겨찾기를 반전하고 저장에 성공한 뒤 표시를 바꾼다. 최신 key/value를 읽는 짧은 로컬 핸들러이므로 useCallback을 두지 않는다. */
  const toggle = async () => {
    setBusy(true);
    try {
      await Storage.setItem(key, value ? '0' : '1');
      if (currentKey.current === key) {
        setSaved({ key, value: !value });
        setError('');
      }
    } catch {
      if (currentKey.current === key) setError('역을 저장하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };
  return { saved: value, toggle, busy, error };
}
