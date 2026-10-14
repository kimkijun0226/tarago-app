import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppButton, useAppTheme } from '@/shared/ui/design-system';
import type { Journey, Point, RouteStep } from '../api/mobility';

type Props = {
  paths: Journey[]; selectedId: string | null; startName: string; endName: string;
  onSelect: (journey: Journey) => void; onBack: () => void;
  onGeometry: (lines: Point[][]) => void; onSubway: (name: string) => void;
};
const SORTS = [{ key: 'minutes', label: '빠른 도착' }, { key: 'transfers', label: '적은 환승' }, { key: 'walkMeters', label: '적은 도보' }] as const;

/** 경로 비교와 이동 순서를 분리하고 제공된 구간 좌표만 지도에 표시한다. */
export function JourneyResults({ paths, selectedId, startName, endName, onSelect, onBack, onGeometry, onSubway }: Props) {
  const { colors, radius, type } = useAppTheme();
  const [sort, setSort] = useState<(typeof SORTS)[number]['key']>('minutes');
  const [focusedStep, setFocusedStep] = useState<number | null>(null);
  const selected = paths.find(path => path.id === selectedId);
  const ordered = [...paths].sort((a, b) => a[sort] - b[sort] || a.minutes - b.minutes);
  const color = (step: RouteStep) => step.mode === 'walk' ? colors.tertiaryText : step.mode === 'bus' ? colors.success : colors.accent;
  const summary = (journey: Journey) => <View style={{ gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}><Text style={{ ...type.largeTitle, color: colors.text }}>{journey.minutes}<Text style={{ ...type.headline }}>분</Text></Text><Text style={{ ...type.footnote, color: colors.secondaryText }}>환승 {journey.transfers}회 · 도보 {distance(journey.walkMeters)}</Text></View>
    <View style={{ flexDirection: 'row', height: 7, borderRadius: 4, overflow: 'hidden', gap: 2 }}>{journey.steps.map((step, i) => <View key={i} style={{ flex: Math.max(1, step.minutes), backgroundColor: color(step) }} />)}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{journey.steps.map((step, i) => <Text key={i} style={{ color: color(step), backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 5, fontSize: 13, fontWeight: '600' }}>{step.mode === 'walk' ? `도보 ${step.minutes}분` : step.lineNames.join(' / ') || (step.mode === 'bus' ? '버스' : '지하철')}</Text>)}</View>
    {journey.fare > 0 ? <Text style={{ ...type.footnote, color: colors.secondaryText }}>교통 요금 {journey.fare.toLocaleString()}원</Text> : null}
  </View>;

  if (!selected) return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text accessibilityRole="header" style={{ ...type.title, color: colors.text }}>추천 경로</Text><Text style={{ ...type.footnote, color: colors.secondaryText }}>{paths.length}개 경로</Text></View>
    <View style={{ flexDirection: 'row', gap: 8 }}>{SORTS.map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: sort === item.key }} onPress={() => setSort(item.key)} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: sort === item.key ? colors.accentSurface : colors.background }}><Text style={{ color: sort === item.key ? colors.accent : colors.secondaryText, fontWeight: '600' }}>{item.label}</Text></Pressable>)}</View>
    {ordered.map((journey, i) => <Pressable key={journey.id} accessibilityRole="button" accessibilityLabel={`${journey.minutes}분, 환승 ${journey.transfers}회 경로 상세 보기`} onPress={() => { setFocusedStep(null); onSelect(journey); }} style={{ padding: 16, borderWidth: 1, borderColor: i === 0 ? colors.accent : colors.separator, borderRadius: radius.lg, gap: 12 }}>
      {i === 0 ? <Text style={{ ...type.footnote, color: colors.accent, fontWeight: '600' }}>{SORTS.find(item => item.key === sort)?.label}</Text> : null}
      {summary(journey)}<Text style={{ ...type.footnote, color: colors.accent }}>이동 순서 · 지도 보기 ›</Text>
    </Pressable>)}
  </View>;

  return <View style={{ gap: 18 }}>
    <Pressable accessibilityRole="button" onPress={onBack} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ ...type.headline, color: colors.accent }}>‹ 다른 경로 비교</Text></Pressable>
    {summary(selected)}
    <AppButton title="전체 경로 지도 보기" variant="secondary" disabled={!selected.geometry.length} onPress={() => { setFocusedStep(null); onGeometry(selected.geometry); }} />
    {!selected.geometry.length ? <Text style={{ ...type.footnote, color: colors.secondaryText }}>이 경로는 지도 선을 제공하지 않습니다. 아래 이동 순서를 확인하세요.</Text> : null}
    <Text accessibilityRole="header" style={{ ...type.headline, color: colors.text }}>이동 순서</Text>
    <Text style={{ ...type.headline, color: colors.text }}>출발 · {startName}</Text>
    {selected.steps.map((step, i) => <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ alignItems: 'center', width: 26 }}><View style={{ height: 26, width: 26, borderRadius: 13, backgroundColor: color(step), alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.onAccent, fontWeight: '600' }}>{i + 1}</Text></View><View style={{ flex: 1, width: 3, backgroundColor: color(step), marginTop: 5 }} /></View>
      <View style={{ flex: 1, padding: 12, marginBottom: 8, borderRadius: radius.md, gap: 6, backgroundColor: focusedStep === i ? colors.accentSurface : colors.background }}>
        <Text style={{ ...type.headline, color: color(step) }}>{step.mode === 'walk' ? '도보 이동' : step.lineNames.join(' / ') || (step.mode === 'bus' ? '버스' : '지하철')}</Text>
        <Text style={{ ...type.footnote, color: colors.secondaryText }}>{step.minutes}분{step.distanceMeters > 0 ? ` · ${distance(step.distanceMeters)}` : ''}{step.mode !== 'walk' && step.stationCount > 0 ? ` · ${step.stationCount}정거장` : ''}</Text>
        <Text style={{ ...type.body, color: colors.text }}>{step.startName || (i === 0 ? startName : '환승 지점')}</Text>
        <Text style={{ ...type.footnote, color: colors.secondaryText }}>↓ {step.mode === 'walk' ? '이동' : '승차 후 이동'}</Text>
        <Text style={{ ...type.body, color: colors.text }}>{step.endName || (i === selected.steps.length - 1 ? endName : '다음 승차 지점')}</Text>
        {step.geometry?.length ? <Pressable accessibilityRole="button" accessibilityState={{ selected: focusedStep === i }} onPress={() => { setFocusedStep(i); onGeometry(step.geometry!); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent, fontWeight: '600' }}>이 구간 지도 보기</Text></Pressable> : null}
        {step.mode === 'subway' && step.startName ? <Pressable accessibilityRole="button" onPress={() => onSubway(step.startName)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent }}>승차역 실시간 도착 확인</Text></Pressable> : null}
      </View>
    </View>)}
    <Text style={{ ...type.headline, color: colors.text }}>도착 · {endName}</Text>
    <Text style={{ ...type.footnote, color: colors.secondaryText }}>예상 소요 시간과 요금은 교통 상황 및 실제 이용 조건에 따라 달라질 수 있습니다.</Text>
  </View>;
}

function distance(meters: number) { return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`; }
