/** @fileoverview 서버의 임시 감시 레코드와 OS의 감시 종료 안내 예약을 함께 생성·연장·중지한다. */
import * as Notifications from 'expo-notifications';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSubwayAlerts, useSubwayAlertMutations } from './use-subway-alerts';
import {
  ensureNotificationPermission,
  preparePush,
} from '@/features/bus-alert/model/alert-runtime';

import { subwayAlertSubtitle, stationLabel } from './subway-direction';
import type { SubwayAlert } from './subway-alert';

/** 일회성 감시의 생성·연장·중지와 OS의 만료 확인 알림을 함께 관리한다. */
export function useSubwayMonitoringSessions() {
  /** 현재 기기에 저장된 서버 알림 목록으로, 필터와 감시 설정의 원본이다. */
  const { data: alerts = [] } = useSubwayAlerts();

  /** 알림 쿼리의 조회 취소·갱신을 수행할 공유 QueryClient다. */
  const client = useQueryClient();

  /** 서버 저장 성공을 기기 사본과 쿼리 캐시에 반영하는 변이다. */
  const {
    save: { mutateAsync: save },
    remove: { mutateAsync: remove },
  } = useSubwayAlertMutations();

  /** 서버 감시와 종료 안내를 함께 준비하고 안내 예약 실패 시 서버 변경을 되돌린다. 변이 함수가 같으면 참조를 유지한다. */
  const activate = useCallback(
    async (source: SubwayAlert, existing?: SubwayAlert) => {
      await ensureNotificationPermission();

      /** 푸시 준비 실패 안내이며, 임시 감시는 연결 준비가 안 되면 시작하지 않는다. */
      const warning = await preparePush();
      if (warning) throw new Error(warning);

      /** 서버가 확정한 임시 감시 레코드로, 종료 안내 예약의 ID와 만료 시각을 제공한다. */
      const startedAt = Date.now();
      const session = await save({
        id: existing?.id,
        input: {
          ...source,
          enabled: true,
          scheduledEnabled: true,
          proximityEnabled: false,
          days: [0, 1, 2, 3, 4, 5, 6],
          startTime: '00:00',
          endTime: '23:59',
          monitoringStartedAt: new Date(startedAt).toISOString(),
          monitoringEndsAt: new Date(startedAt + 60 * 60_000).toISOString(),
          monitoringSourceId: source.monitoringSourceId ?? source.id,
        },
      });
      try {
        await Notifications.setNotificationCategoryAsync('TARAGO_SUBWAY_EXTENSION', [
          {
            identifier: 'EXTEND_MONITORING',
            buttonTitle: '1시간 연장',
            options: { opensAppToForeground: true },
          },
          {
            identifier: 'STOP_MONITORING',
            buttonTitle: '종료',
            options: { opensAppToForeground: true },
          },
        ]);
        await Notifications.scheduleNotificationAsync({
          identifier: `subway-monitor:${session.id}`,
          content: {
            title: `${stationLabel(session.stationName)} · ${subwayAlertSubtitle(session)}`,
            body: '1시간 감시가 끝났습니다. 1시간 더 연장할까요?',
            categoryIdentifier: 'TARAGO_SUBWAY_EXTENSION',
            sound: 'default',
            data: {
              kind: 'subway-monitoring-extension',
              alertId: session.id,
              monitoringEndsAt: session.monitoringEndsAt,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(session.monitoringEndsAt!),
          },
        });
      } catch (e) {
        // 연장 안내를 예약하지 못한 감시가 남지 않도록 저장을 되돌린다.
        if (existing) await save({ id: existing.id, input: existing });
        else await remove(session.id);
        throw e;
      }
      return session;
    },
    [save, remove],
  );

  /** 현재 쿼리 캐시에서 같은 원본의 감시를 찾아 중복 생성 대신 재활성화한다. 런타임 구독에 전달할 참조를 유지한다. */
  const begin = useCallback(
    (source: SubwayAlert) =>
      activate(
        source,
        client
          .getQueryData<SubwayAlert[]>(['subway-alerts'])
          ?.find((a) => a.monitoringSourceId === source.id),
      ),
    [activate, client],
  );

  /** 현재 세션 ID를 유지한 채 지금부터 한 시간으로 갱신한다. activate가 같으면 참조를 유지한다. */
  const extend = useCallback((session: SubwayAlert) => activate(session, session), [activate]);

  /** 서버 감시를 비활성화한 다음 기기의 종료 안내도 취소한다. save가 같으면 참조를 유지한다. */
  const stop = useCallback(
    async (session: SubwayAlert) => {
      await save({ id: session.id, input: { ...session, enabled: false } });
      await Notifications.cancelScheduledNotificationAsync(`subway-monitor:${session.id}`);
    },
    [save],
  );
  // 현재 서버 목록의 작은 필터는 별도 메모 캐시 없이 최신 활성 세션에서 계산한다.
  return { sessions: alerts.filter((a) => a.monitoringSourceId && a.enabled), begin, extend, stop };
}
