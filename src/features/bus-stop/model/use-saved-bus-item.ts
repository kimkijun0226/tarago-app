/** @fileoverview 정류장·노선 즐겨찾기를 기기에 저장한다. 도착정보 등 서버 응답은 저장하지 않는다. */
import { useEffect, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';

/** 선택 대상이 바뀌면 저장 여부를 다시 읽고, 쓰기 실패 시 기존 표시를 유지한다. */
export function useSavedBusItem(id: string) {
  /** 정류장과 노선의 즐겨찾기를 구분하는 저장 키다. */
  const key = `tarago-saved-bus:${id}`;

  /** 마지막으로 읽은 키와 값이다. 다른 대상의 결과를 현재 즐겨찾기로 표시하지 않는다. */
  const [saved, setSaved] = useState({ key: '', value: false });

  /** 저장소 초기 읽기 또는 쓰기 중 중복 조작을 막는다. */
  const [busy, setBusy] = useState(true);

  /** 즐겨찾기 저장소 실패 안내다. */
  const [error, setError] = useState('');

  /** 대상 변경 시 이전 비동기 읽기를 무효화한다. 정리 함수는 해제 뒤 상태 변경도 방지한다. */
  useEffect(() => {
    /** 현재 읽기 결과를 화면에 적용할 수 있는지 구분한다. */
    let active = true;
    Storage.getItem(key)
      .then((value) => {
        if (active) setSaved({ key, value: value === '1' });
      })
      .catch(() => {
        if (active) {
          setSaved({ key, value: false });
          setError('즐겨찾기를 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [key]);

  /** 현재 대상과 일치하는 저장 상태다. 작은 비교이므로 메모이제이션하지 않는다. */
  const value = saved.key === key && saved.value;

  /** 쓰기에 성공한 경우에만 별 표시를 전환한다. 이 함수는 memo 소비자에게 전달하지 않아 useCallback이 필요 없다. */
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Storage.setItem(key, value ? '0' : '1');
      setSaved({ key, value: !value });
      setError('');
    } catch {
      setError('즐겨찾기를 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return { saved: value, toggle, busy: busy || saved.key !== key, error };
}
