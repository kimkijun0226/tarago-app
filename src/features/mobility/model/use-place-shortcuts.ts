/** @fileoverview 집·회사 바로가기의 사용자 선택 장소를 기기에 보관한다. 검색 결과 캐시와 별개의 개인 설정이다. */

import { useEffect, useRef, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';
import type { Place } from '../api/mobility';

/** 바로가기 저장 위치를 고정해 다른 기기 설정과 구분한다. */
const PREFIX = 'tarago-place-shortcut:';

/** 여러 훅 인스턴스의 연속 저장도 호출 순서를 지켜 이전 쓰기가 최신 쓰기를 덮지 않게 한다. */
let writes: Promise<void> = Promise.resolve();

/** 집·회사 중 사용자가 지정할 수 있는 바로가기 종류다. */
export type PlaceShortcutSlot = 'home' | 'work';

/** 등록 전 바로가기는 null로 구분한다. */
export type PlaceShortcuts = Record<PlaceShortcutSlot, Place | null>;

/** 저장된 JSON이 손상됐거나 장소 필수 필드가 유효하지 않으면 오류를 전달한다. */
function parsePlace(raw: string | null): Place | null {
  if (raw === null) return null;

  /** 저장소 데이터도 검증 전에는 신뢰하지 않는다. */
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('address' in value) ||
    typeof value.address !== 'string' ||
    !('latitude' in value) ||
    typeof value.latitude !== 'number' ||
    !Number.isFinite(value.latitude) ||
    Math.abs(value.latitude) > 90 ||
    !('longitude' in value) ||
    typeof value.longitude !== 'number' ||
    !Number.isFinite(value.longitude) ||
    Math.abs(value.longitude) > 180
  )
    throw new Error('바로가기 장소 정보가 올바르지 않습니다.');

  return {
    id: value.id,
    name: value.name,
    address: value.address,
    latitude: value.latitude,
    longitude: value.longitude,
    category: 'category' in value && typeof value.category === 'string' ? value.category : '',
    distanceMeters: null,
    ...('entrance' in value &&
    value.entrance &&
    typeof value.entrance === 'object' &&
    'latitude' in value.entrance &&
    typeof value.entrance.latitude === 'number' &&
    Number.isFinite(value.entrance.latitude) &&
    Math.abs(value.entrance.latitude) <= 90 &&
    'longitude' in value.entrance &&
    typeof value.entrance.longitude === 'number' &&
    Number.isFinite(value.entrance.longitude) &&
    Math.abs(value.entrance.longitude) <= 180
      ? { entrance: { latitude: value.entrance.latitude, longitude: value.entrance.longitude } }
      : {}),
  };
}

/** 초기 조회와 순차 저장을 관리하며 언마운트 후 완료된 작업은 화면 상태에 반영하지 않는다. */
export function usePlaceShortcuts() {
  /** 서버 응답이 아니라 사용자가 바로가기로 지정한 장소 설정이다. */
  const [shortcuts, setShortcuts] = useState<PlaceShortcuts>({ home: null, work: null });

  /** 최초 기기 설정 읽기가 진행 중인지 나타낸다. */
  const [loading, setLoading] = useState(true);

  /** 동시에 요청된 저장이 모두 끝날 때까지 처리 중 표시를 유지한다. */
  const [pending, setPending] = useState(0);

  /** 저장소 접근 또는 데이터 손상 오류를 화면에 전달한다. */
  const [error, setError] = useState<string | null>(null);

  /** 현재 마운트 수명을 식별해 이전 수명의 비동기 결과를 무시한다. */
  const lifetime = useRef(0);

  /** 초기 읽기가 진행되는 사이 사용자가 저장한 슬롯은 이전 읽기 결과로 덮지 않는다. */
  const revisions = useRef({ home: 0, work: 0 });

  /** 기기 설정을 한 번 읽고 cleanup에서 수명을 바꿔 늦은 완료를 차단한다. */
  useEffect(() => {
    /** 이번 마운트의 비동기 작업만 허용하는 수명 번호다. */
    const version = ++lifetime.current;
    Promise.all(
      (['home', 'work'] as const).map(async (slot) => {
        /** 읽기 시작 시 슬롯 버전으로 조회 중 발생한 저장을 구분한다. */
        const revision = revisions.current[slot];
        /** 저장된 개인 장소를 검증해 복원한다. */
        const place = parsePlace(await Storage.getItem(`${PREFIX}${slot}`));
        if (lifetime.current === version && revision === revisions.current[slot]) {
          setShortcuts((current) => ({ ...current, [slot]: place }));
        }
      }),
    )
      .catch(() => {
        if (lifetime.current === version) setError('집·회사 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (lifetime.current === version) setLoading(false);
      });
    return () => {
      lifetime.current = version + 1;
    };
  }, []);

  /** 장소를 순서대로 저장하고 성공한 최신 요청만 표시한다. 실패는 오류 상태와 호출자 양쪽에 전달한다. */
  async function save(slot: PlaceShortcutSlot, place: Place): Promise<void> {
    /** 저장 요청 당시 수명과 슬롯 버전으로 늦은 완료의 상태 변경을 차단한다. */
    const version = lifetime.current;

    /** 같은 슬롯의 마지막 저장 요청을 구분한다. */
    const revision = ++revisions.current[slot];
    /** 저장 전에 직렬화한 값을 고정해 호출자가 객체를 바꿔도 저장 대상이 달라지지 않게 한다. */
    const serialized = JSON.stringify(place);

    /** 저장 성공 후에도 호출자의 객체 변경에 영향받지 않는 장소 스냅샷이다. */
    const snapshot = parsePlace(serialized)!;
    setPending((count) => count + 1);
    setError(null);

    /** 앞선 저장 실패가 다음 저장을 막지 않도록 별도의 완료 큐를 유지한다. */
    const operation = writes.then(() => Storage.setItem(`${PREFIX}${slot}`, serialized));
    writes = operation.catch(() => undefined);
    try {
      await operation;
      if (lifetime.current === version && revisions.current[slot] === revision) {
        setShortcuts((current) => ({ ...current, [slot]: snapshot }));
      }
    } catch (cause) {
      if (lifetime.current === version && revisions.current[slot] === revision) {
        setError('집·회사 정보를 저장하지 못했습니다. 다시 시도해주세요.');
      }
      throw cause;
    } finally {
      if (lifetime.current === version) setPending((count) => count - 1);
    }
  }

  return { shortcuts, busy: loading || pending > 0, error, save };
}
