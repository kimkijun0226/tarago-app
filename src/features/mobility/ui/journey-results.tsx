/** @fileoverview 서버 경로의 교통수단 필터·정렬과 선택 경로의 승하차 타임라인을 표시한다. */

import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/shared/ui';
import { mapUi } from '@/shared/ui/map-design-tokens';
import type { Journey, Point, RouteStep } from '../api/mobility';

type Props = {
  paths: Journey[];
  selectedId: string | null;
  startName: string;
  endName: string;
  onSelect: (journey: Journey) => void;
  onBack: () => void;
  onGeometry: (lines: Point[][]) => void;
  onSubway: (name: string) => void;
};

/** 경로 목록에서 선택할 수 있는 정렬 필드와 사용자 문구다. */
const SORTS = [
  { key: 'minutes', label: '최적 경로' },
  { key: 'transfers', label: '최소 환승' },
  { key: 'walkMeters', label: '최소 도보' },
] as const;

/** 버스·지하철의 단독 또는 혼합 경로를 구분할 필터 목록이다. */
const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'bus', label: '버스' },
  { key: 'subway', label: '지하철' },
  { key: 'mixed', label: '버스+지하철' },
] as const;

/**
 * 후보 경로 비교와 선택 경로의 상세 타임라인을 표시한다.
 * @param props 후보·선택 ID·양 끝 이름과 지도/역 선택 콜백.
 * @returns 선택 여부에 따른 경로 목록 또는 상세 UI. 목록 계산과 렌더 함수는 로컬 상태에 의존하므로 측정 없이 메모화하지 않는다.
 */
export function JourneyResults({
  paths,
  selectedId,
  startName,
  endName,
  onSelect,
  onBack,
  onGeometry,
  onSubway,
}: Props) {
  /** 공통 앱 색상을 읽어 지도 전용 팔레트의 기본값으로 사용한다. */
  const { colors: appColors } = useAppTheme();

  /** 지도 검색 화면의 색상 토큰을 기본 테마에 덮어써 지도·카드·검색창의 색을 일치시킨다. */
  const colors = {
    ...appColors,
    accent: mapUi.blue,
    accentSurface: mapUi.blueSurface,
    surface: mapUi.background,
    background: mapUi.background,
    text: mapUi.text,
    secondaryText: mapUi.secondaryText,
    separator: mapUi.border,
    secondarySurface: mapUi.separator,
  };

  /** 후보 경로의 정렬 기준이다. 사용자가 고른 기준에 따라 ordered를 다시 계산한다. */
  const [sort, setSort] = useState<(typeof SORTS)[number]['key']>('minutes');

  /** 결과를 연 시각을 고정해 다시 렌더해도 예상 출발·도착 시각이 움직이지 않게 한다. */
  const [departure] = useState(() => new Date());

  /** 경유 정류장을 펼친 이동 구간의 인덱스다. null이면 모든 구간을 접는다. */
  const [expandedStops, setExpandedStops] = useState<number | null>(null);

  /** 현재 목록에 포함할 교통수단 조합이다. */
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  /** 부모가 전달한 선택 ID에 해당하는 경로다. 없으면 후보 비교 목록을 표시한다. */
  const selected = paths.find((path) => path.id === selectedId);

  /** 현재 선택을 표시하고 실제 후보 정렬 기준을 변경한다. */
  function chooseSort() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...SORTS.map((item) => item.label), '취소'], cancelButtonIndex: SORTS.length },
        (index) => {
          if (index < SORTS.length) setSort(SORTS[index].key);
        },
      );
      return;
    }
    Alert.alert(
      '경로 정렬',
      undefined,
      SORTS.map((item) => ({
        text: `${sort === item.key ? '✓ ' : ''}${item.label}`,
        onPress: () => setSort(item.key),
      })),
      { cancelable: true },
    );
  }

  /**
   * 교통수단 조합으로 경로 필터 포함 여부를 판단한다.
   * @param journey 후보 경로.
   * @param key 선택 필터.
   */
  const matches = (journey: Journey, key: typeof filter) => {
    /** 경로에 버스 탑승 구간이 하나 이상 있는지 확인한다. */
    const bus = journey.steps.some((step) => step.mode === 'bus');

    /** 경로에 지하철 탑승 구간이 하나 이상 있는지 확인한다. */
    const subway = journey.steps.some((step) => step.mode === 'subway');
    return (
      key === 'all' ||
      (key === 'bus' && bus && !subway) ||
      (key === 'subway' && subway && !bus) ||
      (key === 'mixed' && bus && subway)
    );
  };

  /** 원본 후보를 변경하지 않고 필터 후 선택 기준과 총 소요시간 순으로 정렬한 목록이다. */
  const ordered = [...paths]
    .filter((path) => matches(path, filter))
    .sort((a, b) => a[sort] - b[sort] || a.minutes - b.minutes);

  /**
   * 서버 노선 색상을 우선하고 없는 구간은 이동수단별 색을 사용한다.
   * @param step 표시할 이동 구간.
   */
  const color = (step: RouteStep) =>
    step.lineColor ??
    (step.mode === 'walk'
      ? colors.tertiaryText
      : step.mode === 'bus'
        ? colors.success
        : colors.accent);

  /**
   * 경로의 총 소요시간·환승·도보·요금과 구간별 시간 막대를 표시한다.
   * @param journey 요약할 경로.
   */
  const summary = (journey: Journey) => (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 38, fontWeight: '700' }}>
        {journey.minutes}
        <Text style={{ fontSize: 17, fontWeight: '400' }}>분</Text>
      </Text>
      <Text style={{ color: colors.secondaryText, fontSize: 14 }}>
        {time(departure)} ~ {time(new Date(departure.getTime() + journey.minutes * 60_000))}
        {journey.fare > 0 ? ` · ${journey.fare.toLocaleString()}원` : ''}
      </Text>
      <Text style={{ color: colors.secondaryText, fontSize: 13 }}>
        환승 {journey.transfers}회 · 도보 {distance(journey.walkMeters)}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          height: 20,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: colors.secondarySurface,
        }}
      >
        {journey.steps.map((step, i) => (
          <View
            key={i}
            style={{
              flex: Math.max(1, step.minutes),
              borderRadius: 3,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: step.mode === 'walk' ? colors.secondarySurface : color(step),
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 10,
                color: step.mode === 'walk' ? colors.secondaryText : colors.onAccent,
              }}
            >
              {step.minutes < 3 ? step.minutes : `${step.minutes}분`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  /**
   * 도보를 제외한 탑승 구간의 노선·승차·하차 정보를 표시한다.
   * @param journey 표시할 경로.
   */
  const boarding = (journey: Journey) => (
    <View style={{ gap: 14, paddingTop: 6 }}>
      {journey.steps
        .filter((step) => step.mode !== 'walk')
        .map((step, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
            <Text numberOfLines={2} style={{ width: 76, fontWeight: '700', color: color(step) }}>
              {step.lineNames.map((name) => name.replace(/^수도권/, '')).join(' / ') ||
                (step.mode === 'bus' ? '버스' : '지하철')}
            </Text>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ color: colors.text }}>{step.startName} 승차</Text>
              <Text style={{ color: colors.secondaryText, fontSize: 13 }}>
                {step.stationCount > 0 ? `${step.stationCount}정거장 · ` : ''}
                {step.minutes}분 이동
              </Text>
              <Text style={{ color: colors.text }}>{step.endName} 하차</Text>
            </View>
          </View>
        ))}
    </View>
  );

  if (!selected)
    return (
      <View>
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 16,
            borderBottomWidth: 0.5,
            borderColor: colors.separator,
          }}
        >
          {FILTERS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item.key }}
              onPress={() => setFilter(item.key)}
              style={{
                paddingVertical: 16,
                marginRight: 18,
                borderBottomWidth: filter === item.key ? 2 : 0,
                borderColor: colors.text,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: filter === item.key ? colors.text : colors.secondaryText,
                  fontWeight: filter === item.key ? '700' : '400',
                }}
              >
                {item.label}
                {` ${paths.filter((path) => matches(path, item.key)).length}`}
              </Text>
            </Pressable>
          ))}
        </View>
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 0.5,
            borderColor: colors.separator,
          }}
        >
          <Text style={{ flex: 1, alignSelf: 'center', color: colors.text, fontSize: 13 }}>
            현재 출발 · {time(departure)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="경로 정렬 선택"
            onPress={chooseSort}
            style={{ minHeight: 32, justifyContent: 'center', paddingLeft: 12 }}
          >
            <Text style={{ color: colors.text, fontSize: 13 }}>
              {SORTS.find((item) => item.key === sort)?.label}⌄
            </Text>
          </Pressable>
        </View>
        {ordered.length === 0 ? (
          <Text style={{ padding: 24, color: colors.secondaryText }}>
            해당 교통수단의 경로가 없습니다.
          </Text>
        ) : null}
        {ordered.map((journey, i) => (
          <View
            key={journey.id}
            style={{
              paddingHorizontal: 18,
              paddingTop: 20,
              paddingBottom: 0,
              borderBottomWidth: 8,
              borderColor: colors.secondarySurface,
              gap: 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${journey.minutes}분 경로 상세 보기`}
              onPress={() => {
                onSelect(journey);
              }}
              style={{ gap: 10 }}
            >
              {i === 0 ? (
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>
                  {SORTS.find((item) => item.key === sort)?.label}
                </Text>
              ) : null}
              {summary(journey)}
            </Pressable>
            {boarding(journey)}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSelect(journey);
              }}
              style={{
                borderTopWidth: 0.5,
                borderColor: colors.separator,
                minHeight: 48,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.accent, fontWeight: '700' }}>경로 상세 ›</Text>
            </Pressable>
          </View>
        ))}
      </View>
    );

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 18,
          borderBottomWidth: 0.5,
          borderColor: colors.separator,
        }}
      >
        <Pressable accessibilityRole="button" onPress={onBack} style={{ paddingVertical: 16 }}>
          <Text style={{ color: colors.text }}>‹ 경로 목록</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!selected.geometry.length}
          onPress={() => onGeometry(selected.geometry)}
          style={{ paddingVertical: 16 }}
        >
          <Text style={{ color: selected.geometry.length ? colors.accent : colors.tertiaryText }}>
            지도 보기
          </Text>
        </Pressable>
      </View>
      <View style={{ padding: 18, borderBottomWidth: 8, borderColor: colors.secondarySurface }}>
        <Text style={{ color: colors.accent, fontSize: 12, marginBottom: 10 }}>
          현재 출발 기준 예상
        </Text>
        {summary(selected)}
      </View>
      <View style={{ paddingHorizontal: 20, paddingVertical: 24 }}>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 22 }}>
          ● 출발 · {startName}
        </Text>
        {selected.steps.map((step, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ width: 20, alignItems: 'center' }}>
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  borderWidth: 4,
                  borderColor: color(step),
                  backgroundColor: colors.surface,
                }}
              />
              <View
                style={{
                  flex: 1,
                  width: step.mode === 'walk' ? 2 : 4,
                  backgroundColor: color(step),
                }}
              />
            </View>
            <View style={{ flex: 1, paddingBottom: 26, gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
                {step.startName || (i === 0 ? startName : '환승 지점')}
                {step.mode !== 'walk' ? ' 승차' : ''}
              </Text>
              <Text style={{ color: color(step), fontWeight: '600' }}>
                {step.mode === 'walk'
                  ? '도보'
                  : step.lineNames.map((name) => name.replace(/^수도권/, '')).join(' / ') ||
                    (step.mode === 'bus' ? '버스' : '지하철')}{' '}
                · {step.minutes}분
                {step.distanceMeters > 0 ? ` · ${distance(step.distanceMeters)}` : ''}
              </Text>
              {step.stationCount > 0 ? (
                <Text style={{ color: colors.secondaryText }}>{step.stationCount}정거장 이동</Text>
              ) : null}
              {step.stops && step.stops.length > 0 ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: expandedStops === i }}
                    onPress={() => setExpandedStops(expandedStops === i ? null : i)}
                    style={{ paddingVertical: 8 }}
                  >
                    <Text style={{ color: colors.secondaryText }}>
                      경유 정류장 {expandedStops === i ? '접기 ∧' : '보기 ∨'}
                    </Text>
                  </Pressable>
                  {expandedStops === i ? (
                    <View style={{ paddingLeft: 8, gap: 14 }}>
                      {step.stops.map((stop) => (
                        <Text
                          key={`${stop.id}-${stop.sequence}`}
                          style={{ color: colors.secondaryText }}
                        >
                          ○ {stop.name}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
              {step.walkInstructions?.map((instruction, index) => (
                <View key={index} style={{ paddingVertical: 6, gap: 4 }}>
                  <Text style={{ color: colors.text }}>{instruction.description}</Text>
                  {instruction.distanceMeters > 0 ? (
                    <Text style={{ color: colors.secondaryText, fontSize: 12 }}>
                      {distance(instruction.distanceMeters)}
                    </Text>
                  ) : null}
                </View>
              ))}
              {step.geometry?.length ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onGeometry(step.geometry!);
                  }}
                  style={{ paddingVertical: 8 }}
                >
                  <Text style={{ color: colors.accent }}>구간 지도 보기 ›</Text>
                </Pressable>
              ) : null}
              {step.mode === 'subway' && step.startName ? (
                <Pressable onPress={() => onSubway(step.startName)} style={{ paddingVertical: 8 }}>
                  <Text style={{ color: colors.accent }}>실시간 도착</Text>
                </Pressable>
              ) : null}
              <Text style={{ color: colors.text }}>
                {step.endName || (i === selected.steps.length - 1 ? endName : '다음 승차 지점')}
                {step.mode !== 'walk' ? ' 하차' : ''}
              </Text>
            </View>
          </View>
        ))}
        <Text style={{ color: colors.text, fontWeight: '700' }}>● 도착 · {endName}</Text>
      </View>
    </View>
  );
}

/**
 * 경로 거리를 화면용 단위로 표시한다.
 * @param meters 미터 단위 거리.
 * @returns 1km 미만은 반올림한 m, 이상은 소수 한 자리 km 문자열.
 */
function distance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

/** 기기의 현지 시간으로 경로 출발·예상 도착 시각을 표시한다. */
function time(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
