import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { API_BASE_URL } from '@/shared/api/config';
import { useWidgetSelection, widgetNative } from '../model/widget-selection';

/** 예약 알림과 독립적인 위젯 조회 조건을 앱 그룹으로 전달한다. */
export function WidgetSync() {
  const { selected, hydrated, busy, initialize, setError } = useWidgetSelection();
  const [activation, setActivation] = useState(0);
  const last = useRef('');
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setActivation((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);
  const configuration = JSON.stringify({ apiBaseURL: API_BASE_URL, items: selected });
  useEffect(() => {
    if (Platform.OS !== 'ios' || !widgetNative || !hydrated || busy) return;
    const key = `${activation}:${configuration}`;
    if (last.current === key) return;
    try {
      widgetNative.writeConfiguration(configuration);
      last.current = key;
      setError(null);
    } catch (error) {
      console.warn('홈 위젯 동기화 실패', error instanceof Error ? error.name : 'unknown');
      setError('홈 위젯에 반영하지 못했어요. 앱을 다시 열어주세요.');
    }
  }, [activation, configuration, hydrated, busy, setError]);
  return null;
}
