import { useEffect, useRef, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';
const PREFIX = 'tarago-saved-subway:';

/** 기존 역별 저장 키를 그대로 읽어 검색 화면에서 저장한 역에 다시 진입한다. */
export async function readSavedSubwayStations(): Promise<{ stationName: string; lineName: string }[]> {
  const keys = (await Storage.getAllKeys()).filter(key => key.startsWith(PREFIX));
  const values = await Promise.all(keys.map(async key => ({ key, value: await Storage.getItem(key) })));
  return values.flatMap(({ key, value }) => {
    const [stationName, lineName] = key.slice(PREFIX.length).split(':');
    return value === '1' && stationName && lineName ? [{ stationName, lineName }] : [];
  });
}

/** 역·노선별 저장 상태는 서버 도착정보와 분리해 기존 기기 저장소에 보관한다. */
export function useSavedSubwayStation(stationName: string, lineName: string) {
  const key = `${PREFIX}${stationName}:${lineName}`;
  const [saved, setSaved] = useState<{ key: string; value: boolean }>({ key: '', value: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const currentKey = useRef(key);
  useEffect(() => {
    currentKey.current = key;
    let active = true;
    Storage.getItem(key).then(value => { if (active) setSaved({ key, value: value === '1' }); })
      .catch(() => { if (active) setError('저장한 역 정보를 불러오지 못했습니다.'); });
    return () => { active = false; };
  }, [key]);
  const value = saved.key === key && saved.value;
  const toggle = async () => {
    setBusy(true);
    try { await Storage.setItem(key, value ? '0' : '1'); if (currentKey.current === key) { setSaved({ key, value: !value }); setError(''); } }
    catch { if (currentKey.current === key) setError('역을 저장하지 못했습니다. 다시 시도해주세요.'); }
    finally { setBusy(false); }
  };
  return { saved: value, toggle, busy, error };
}
