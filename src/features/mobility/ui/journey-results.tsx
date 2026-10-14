import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/shared/ui/design-system';
import { mapUi } from '@/shared/ui/map-design-tokens';
import type { Journey, Point, RouteStep } from '../api/mobility';

type Props = { paths: Journey[]; selectedId: string | null; startName: string; endName: string; onSelect: (journey: Journey) => void; onBack: () => void; onGeometry: (lines: Point[][]) => void; onSubway: (name: string) => void };
const SORTS = [{ key: 'minutes', label: '최적 경로' }, { key: 'transfers', label: '최소 환승' }, { key: 'walkMeters', label: '최소 도보' }] as const;
const FILTERS = [{ key: 'all', label: '전체' }, { key: 'bus', label: '버스' }, { key: 'subway', label: '지하철' }, { key: 'mixed', label: '버스+지하철' }] as const;

/** 실제 제공된 이동 구간으로 비교 목록과 승하차 타임라인을 구성한다. */
export function JourneyResults({ paths, selectedId, startName, endName, onSelect, onBack, onGeometry, onSubway }: Props) {
  const { colors: appColors } = useAppTheme();
  const colors = { ...appColors, accent: mapUi.blue, accentSurface: mapUi.blueSurface, surface: mapUi.background, background: mapUi.background, text: mapUi.text, secondaryText: mapUi.secondaryText, separator: mapUi.border, secondarySurface: mapUi.separator };
  const [sort, setSort] = useState<(typeof SORTS)[number]['key']>('minutes');
  const [expandedStops, setExpandedStops] = useState<number | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const selected = paths.find(path => path.id === selectedId);
  const matches = (journey: Journey, key: typeof filter) => {
    const bus = journey.steps.some(step => step.mode === 'bus');
    const subway = journey.steps.some(step => step.mode === 'subway');
    return key === 'all' || (key === 'bus' && bus && !subway) || (key === 'subway' && subway && !bus) || (key === 'mixed' && bus && subway);
  };
  const ordered = [...paths].filter(path => matches(path, filter)).sort((a, b) => a[sort] - b[sort] || a.minutes - b.minutes);
  const color = (step: RouteStep) => step.lineColor ?? (step.mode === 'walk' ? colors.tertiaryText : step.mode === 'bus' ? colors.success : colors.accent);
  const summary = (journey: Journey) => <View style={{ gap: 12 }}>
    <Text style={{ color: colors.text, fontSize: 36, fontWeight: '700' }}>{journey.minutes}<Text style={{ fontSize: 17, fontWeight: '400' }}>분</Text></Text>
    <Text style={{ color: colors.secondaryText, fontSize: 14 }}>환승 {journey.transfers}회 · 도보 {distance(journey.walkMeters)}{journey.fare > 0 ? ` · ${journey.fare.toLocaleString()}원` : ''}</Text>
    <View style={{ flexDirection: 'row', height: 22, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.secondarySurface }}>{journey.steps.map((step, i) => <View key={i} style={{ flex: Math.max(1, step.minutes), borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: step.mode === 'walk' ? colors.secondarySurface : color(step) }}><Text numberOfLines={1} style={{ fontSize: 10, color: step.mode === 'walk' ? colors.secondaryText : colors.onAccent }}>{step.minutes < 3 ? step.minutes : `${step.minutes}분`}</Text></View>)}</View>
  </View>;
  const boarding = (journey: Journey) => <View style={{ gap: 16, paddingTop: 14, borderTopWidth: .5, borderColor: colors.separator }}>{journey.steps.filter(step => step.mode !== 'walk').map((step, i) => <View key={i} style={{ flexDirection: 'row', gap: 12 }}><Text style={{ width: 76, fontWeight: '700', color: color(step) }}>{step.lineNames.map(name => name.replace(/^수도권/, '')).join(' / ') || (step.mode === 'bus' ? '버스' : '지하철')}</Text><View style={{ flex: 1, gap: 8 }}><Text style={{ color: colors.text }}>{step.startName}</Text><Text style={{ color: colors.secondaryText }}>↓ {step.stationCount > 0 ? `${step.stationCount}정거장 · ` : ''}{step.minutes}분</Text><Text style={{ color: colors.text }}>{step.endName} 하차</Text></View></View>)}</View>;

  if (!selected) return <View>
    <View style={{ flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: .5, borderColor: colors.separator }}>{FILTERS.map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: filter === item.key }} onPress={() => setFilter(item.key)} style={{ paddingVertical: 16, marginRight: 18, borderBottomWidth: filter === item.key ? 2 : 0, borderColor: colors.text }}><Text style={{ fontSize: 14, color: filter === item.key ? colors.text : colors.secondaryText, fontWeight: filter === item.key ? '700' : '400' }}>{item.label}{item.key !== 'all' ? ` ${paths.filter(path => matches(path, item.key)).length}` : ''}</Text></Pressable>)}</View>
    <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: .5, borderColor: colors.separator }}>{SORTS.map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: sort === item.key }} onPress={() => setSort(item.key)} style={{ flex: 1, minHeight: 32, justifyContent: 'center' }}><Text style={{ fontSize: 13, color: sort === item.key ? colors.accent : colors.secondaryText }}>{item.label}</Text></Pressable>)}</View>
    {ordered.length === 0 ? <Text style={{ padding: 24, color: colors.secondaryText }}>해당 교통수단의 경로가 없습니다.</Text> : null}
    {ordered.map((journey, i) => <View key={journey.id} style={{ padding: 18, borderBottomWidth: 8, borderColor: colors.secondarySurface, gap: 16 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${journey.minutes}분 경로 상세 보기`} onPress={() => { onSelect(journey); }} style={{ gap: 10 }}>
        {i === 0 ? <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>{SORTS.find(item => item.key === sort)?.label}</Text> : null}
        {summary(journey)}
      </Pressable>
      {boarding(journey)}
      <Pressable accessibilityRole="button" onPress={() => { onSelect(journey); }} style={{ borderWidth: 1, borderColor: colors.separator, borderRadius: 8, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.accent, fontWeight: '700' }}>경로 상세</Text></Pressable>
    </View>)}
  </View>;

  return <View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, borderBottomWidth: .5, borderColor: colors.separator }}>
      <Pressable accessibilityRole="button" onPress={onBack} style={{ paddingVertical: 16 }}><Text style={{ color: colors.text }}>‹ 경로 목록</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!selected.geometry.length} onPress={() => onGeometry(selected.geometry)} style={{ paddingVertical: 16 }}><Text style={{ color: selected.geometry.length ? colors.accent : colors.tertiaryText }}>지도 보기</Text></Pressable>
    </View>
    <View style={{ padding: 18, borderBottomWidth: 8, borderColor: colors.secondarySurface }}>{summary(selected)}</View>
    <View style={{ paddingHorizontal: 20, paddingVertical: 24 }}>
      <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 22 }}>● 출발 · {startName}</Text>
      {selected.steps.map((step, i) => <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
        <View style={{ width: 20, alignItems: 'center' }}><View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 4, borderColor: color(step), backgroundColor: colors.surface }} /><View style={{ flex: 1, width: step.mode === 'walk' ? 2 : 4, backgroundColor: color(step) }} /></View>
        <View style={{ flex: 1, paddingBottom: 26, gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{step.startName || (i === 0 ? startName : '환승 지점')}{step.mode !== 'walk' ? ' 승차' : ''}</Text>
          <Text style={{ color: color(step), fontWeight: '600' }}>{step.mode === 'walk' ? '도보' : step.lineNames.map(name => name.replace(/^수도권/, '')).join(' / ') || (step.mode === 'bus' ? '버스' : '지하철')} · {step.minutes}분{step.distanceMeters > 0 ? ` · ${distance(step.distanceMeters)}` : ''}</Text>
          {step.stationCount > 0 ? <Text style={{ color: colors.secondaryText }}>{step.stationCount}정거장 이동</Text> : null}
          {step.stops && step.stops.length > 0 ? <>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedStops === i }} onPress={() => setExpandedStops(expandedStops === i ? null : i)} style={{ paddingVertical: 8 }}><Text style={{ color: colors.secondaryText }}>경유 정류장 {expandedStops === i ? '접기 ∧' : '보기 ∨'}</Text></Pressable>
            {expandedStops === i ? <View style={{ paddingLeft: 8, gap: 14 }}>{step.stops.map(stop => <Text key={`${stop.id}-${stop.sequence}`} style={{ color: colors.secondaryText }}>○ {stop.name}</Text>)}</View> : null}
          </> : null}
          {step.walkInstructions?.map((instruction, index) => <View key={index} style={{ paddingVertical: 6, gap: 4 }}><Text style={{ color: colors.text }}>{instruction.description}</Text>{instruction.distanceMeters > 0 ? <Text style={{ color: colors.secondaryText, fontSize: 12 }}>{distance(instruction.distanceMeters)}</Text> : null}</View>)}
          {step.geometry?.length ? <Pressable accessibilityRole="button" onPress={() => { onGeometry(step.geometry!); }} style={{ paddingVertical: 8 }}><Text style={{ color: colors.accent }}>구간 지도 보기 ›</Text></Pressable> : null}
          {step.mode === 'subway' && step.startName ? <Pressable onPress={() => onSubway(step.startName)} style={{ paddingVertical: 8 }}><Text style={{ color: colors.accent }}>실시간 도착</Text></Pressable> : null}
          <Text style={{ color: colors.text }}>{step.endName || (i === selected.steps.length - 1 ? endName : '다음 승차 지점')}{step.mode !== 'walk' ? ' 하차' : ''}</Text>
        </View>
      </View>)}
      <Text style={{ color: colors.text, fontWeight: '700' }}>● 도착 · {endName}</Text>
    </View>
  </View>;
}
function distance(meters: number) { return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`; }
