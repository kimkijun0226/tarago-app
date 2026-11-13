import { ArrivalTimeIndicator, useArrivalTimeEntering, useArrivalTimeRefreshing } from '@/shared/ui/arrival-time-entrance';
import { EditWiggle } from '@/shared/ui/edit-wiggle';
import { useCallback, useMemo, useRef, useState } from 'react';
import Sortable, { type SortableGridRenderItem } from 'react-native-sortables';
import Animated, { LinearTransition, FadeOut, useSharedValue, useAnimatedStyle, withTiming, withSpring, ReduceMotion, type AnimatedRef } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appColors as c } from '@/shared/ui/theme';
import { TransportIcon } from '@/shared/ui/transport-icon';
import { useWidgetArrival } from '../model/use-widget-arrival';
import type { WidgetTarget } from '../model/widget-configuration';

type Cell = { id: string; target?: WidgetTarget };

function feedback(kind: 'lift' | 'move' | 'drop') {
  const task =
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(
          kind === 'lift'
            ? Haptics.AndroidHaptics.Long_Press
            : kind === 'move'
              ? Haptics.AndroidHaptics.Segment_Frequent_Tick
              : Haptics.AndroidHaptics.Gesture_End,
        )
      : kind === 'move'
        ? Haptics.selectionAsync()
        : Haptics.impactAsync(
            kind === 'lift'
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light,
          );
  void task.catch((error: unknown) => console.warn('즐겨찾기 진동 실패', error));
}

/** 추가 칸은 고정하고 저장된 시간표만 그룹 안에서 정렬한다. */
export function FavoritesGrid({
  items,
  columns,
  editing,
  onEdit,
  onCancelEdit,
  onAdd,
  onOpen,
  onRemove,
  onReorder,
  disabled,
  scrollableRef,
}: {
  items: WidgetTarget[];
  columns: 2 | 3 | 4;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onAdd: () => void;
  onOpen: (item: WidgetTarget) => void;
  onRemove: (item: WidgetTarget) => void;
  onReorder: (ids: string[]) => Promise<boolean>;
  disabled: boolean;
  scrollableRef: AnimatedRef<ScrollView>;
}) {
  const [width, setWidth] = useState(320);
  const [pendingOrder, setPendingOrder] = useState<{
    source: WidgetTarget[];
    items: WidgetTarget[];
  } | null>(null);
  const ordered = pendingOrder?.source === items ? pendingOrder.items : items;
  const dragging = useRef(false);
  const lastLift = useRef(0);
  const suppressTapUntil = useRef(0);
  const lastMoveFeedback = useRef(0);
  const columnGap = columns === 2 ? 20 : columns === 3 ? 16 : 12;
  const diameter = Math.max(1, (width - columnGap * (columns - 1)) / columns);
  const cells = useMemo<Cell[]>(
    () => [
      ...ordered.map((target) => ({ id: target.id, target })),
      ...Array.from(
        { length: Math.max(columns, ordered.length + 1) - ordered.length },
        (_, index) => ({ id: `add:${index}` }),
      ),
    ],
    [ordered, columns],
  );
  const addScale = useSharedValue(1);
  const addMotion = useAnimatedStyle(() => ({ transform: [{ scale: addScale.get() }] }));

  const beginEditing = useCallback(() => {
    if (!disabled && !editing && Date.now() - lastLift.current >= 700) {
      lastLift.current = Date.now();
      feedback('lift');
      onEdit();
    }
  }, [disabled, editing, onEdit]);

  const renderItem = useCallback<SortableGridRenderItem<Cell>>(
    ({ item, index }) => (
      <Animated.View
        style={{ width: diameter, height: diameter }}
      >
        {item.target ? (
          <View onTouchStart={(event) => event.stopPropagation()}>
            <Sortable.Handle>
              <Sortable.Touchable
                gestureMode="simultaneous"
                onLongPress={beginEditing}
                onTap={() => {
                  if (!disabled && !editing && !dragging.current && Date.now() > suppressTapUntil.current && item.target)
                    onOpen(item.target);
                }}
                accessible
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                accessibilityActions={editing ? [] : [{ name: 'activate' }, { name: 'edit', label: '즐겨찾기 편집' }]}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (disabled || editing || !item.target) return;
                  if (nativeEvent.actionName === 'activate') onOpen(item.target);
                  if (nativeEvent.actionName === 'edit') onEdit();
                }}
                accessibilityLabel={`${item.target.title} ${item.target.stationName}${editing ? ' 순서 변경' : ' 상세 보기'}`}
                accessibilityHint="길게 누른 채 움직이면 순서를 바꿀 수 있어요"
              >
                <EditWiggle active={editing} index={index}>
                  <Arrival item={item.target} diameter={diameter} />
                </EditWiggle>
              </Sortable.Touchable>
            </Sortable.Handle>
            {editing && (
              <Pressable
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`${item.target.title} 즐겨찾기 삭제`}
                hitSlop={10}
                onPress={() => {
                  if (item.target) {
                    feedback('drop');
                    onRemove(item.target);
                  }
                }}
                style={s.remove}
              >
                <Text style={s.close}>×</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Sortable.Handle mode="fixed-order">
            <Animated.View style={addMotion}>
            <Pressable
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={editing ? '즐겨찾기 수정 취소' : '즐겨찾기 추가'}
              onTouchStart={(event) => event.stopPropagation()}
              onPressIn={() => addScale.set(withTiming(0.93, { duration: 200, reduceMotion: ReduceMotion.System }))}
              onPressOut={() => addScale.set(withSpring(1, { damping: 12, stiffness: 320, reduceMotion: ReduceMotion.System }))}
              onPress={editing ? onCancelEdit : onAdd}
              style={[s.add, { width: diameter, opacity: editing ? 0.35 : 1 }]}
            >
              <Text style={s.plus}>+</Text>
            </Pressable>
            </Animated.View>
          </Sortable.Handle>
        )}
      </Animated.View>
    ),
    [addMotion, addScale, beginEditing, diameter, disabled, editing, onOpen, onRemove, onAdd, onCancelEdit, onEdit],
  );
  return (
    <View style={s.grid} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Sortable.Grid
        data={cells}
        renderItem={renderItem}
        columns={columns}
        customHandle
        rowGap={columns === 2 ? 24 : 18}
        columnGap={columnGap}
        strategy="insert"
        scrollableRef={scrollableRef}
        sortEnabled={!disabled}
        dragActivationDelay={editing ? 0 : 400}
        dragActivationFailOffset={editing ? 24 : 5}
        autoScrollEnabled
        autoScrollActivationOffset={88}
        autoScrollMaxOverscroll={0}
        enableActiveItemSnap={false}
        activationAnimationDuration={100}
        dropAnimationDuration={0}
        activeItemScale={1}
        inactiveItemOpacity={0.85}
        dimensionsAnimationType="worklet"
        itemsLayoutTransitionMode="all"
        itemExiting={FadeOut.duration(150)}
        onDragStart={() => {
          dragging.current = true;
          lastMoveFeedback.current = Date.now();
          beginEditing();
        }}
        onOrderChange={() => {
          const now = Date.now();
          if (now - lastMoveFeedback.current >= 80) {
            lastMoveFeedback.current = now;
            feedback('move');
          }
        }}
        onActiveItemDropped={() => {
          suppressTapUntil.current = Date.now() + 400;
          feedback('drop');
        }}
        onDragEnd={({ data }) => {
          dragging.current = false;
          suppressTapUntil.current = Date.now() + 400;
          const next = data.flatMap((cell) => (cell.target ? [cell.target] : []));
          if (next.some((item, index) => item.id !== items[index]?.id)) {
            setPendingOrder({ source: items, items: next });
            void onReorder(next.map((item) => item.id)).then((saved) => {
              if (!saved) setPendingOrder(null);
            });
          }
        }}
      />
    </View>
  );
}
/** 확대 값은 그리드에서 공유해 드래그 포털로 옮겨질 때도 복귀 애니메이션을 이어간다. */
function Arrival({ item, diameter }: { item: WidgetTarget; diameter: number }) {
  const { direction, time, color, remainingSeconds, loading } = useWidgetArrival(item);
  const entering = useArrivalTimeEntering();
  const refreshing = useArrivalTimeRefreshing();
  const showLoading = entering || refreshing || (
    loading && remainingSeconds === null && time !== '운행 종료' && !time.startsWith('첫차')
  );
  const title = item.transport === 'subway' && item.expressOnly ? `${item.title} · 급행` : item.title;
  const textScale = Math.max(1, Math.min(2, diameter / 80));
  const directionStyle = [s.direction, { fontSize: 7 * textScale, lineHeight: 9 * textScale }];
  const minutes = time.match(/\d+분/)?.[0];
  const timer =
    remainingSeconds !== null && remainingSeconds > 0
      ? `${Math.floor(remainingSeconds / 60)}:${String(Math.floor(remainingSeconds % 60)).padStart(2, '0')}`
      : null;
  const label = timer ?? minutes ?? time;
  const firstDeparture = time.startsWith('첫차 출발 전') ? time.match(/\b\d{2}:\d{2}\b/)?.[0] : undefined;
  const displayTime = time === '운행 종료' ? time : showLoading && remainingSeconds === null ? '조회 중' :
    remainingSeconds !== null ? label : firstDeparture ? `첫차 ${firstDeparture}` :
      /오류|갱신/.test(time) ? '갱신 지연' : time.split('\n')[0];
  return (
    <Animated.View
      layout={LinearTransition.duration(280)}
      style={[s.ring, s.activeRing, { width: diameter }]}
      accessibilityLabel={`${title} ${item.stationName} ${direction} ${showLoading ? '조회 중' : time}`}
    >
      <Image
        source={{ uri: ringImage(color, remainingSeconds, remainingSeconds === null) }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        cachePolicy="memory"
        transition={150}
        accessible={false}
      />
      {(
        <View style={s.timeCover}>
          <Text
            style={[s.time, { fontSize: 11 * textScale, lineHeight: 13 * textScale, opacity: showLoading ? 0 : 1 }]}
            accessibilityElementsHidden={showLoading}
            importantForAccessibility={showLoading ? 'no' : 'auto'}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {displayTime}
          </Text>
          {showLoading && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.timeLoader]}>
              <ArrivalTimeIndicator />
            </View>
          )}
        </View>
      )}
      {(
        <View
          style={[
            s.identity,
            {
              top: diameter * 0.18,
              bottom: diameter * 0.16,
              left: diameter * 0.13,
              right: diameter * 0.13,
              gap: 4 * textScale,
            },
          ]}
        >
          <View style={[s.identityTitle, { gap: 3 * textScale }]}>
            <TransportIcon
              transport={item.transport}
              size={Math.round(12 * textScale)}
              tintColor={color}
            />
            <Text
              style={[s.title, { fontSize: 10 * textScale, lineHeight: 12 * textScale }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {title.replace(/번$/, '')}
            </Text>
          </View>
          <Text
            style={[s.station, { fontSize: 8 * textScale, lineHeight: 10 * textScale }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {item.transport === 'subway'
              ? `${item.stationName.replace(/역$/, '')}역`
              : item.stationName}
          </Text>
          <Text
            style={directionStyle}
            numberOfLines={item.transport === 'bus' ? 2 : 1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {item.transport === 'bus' ? direction : direction.split(' · ').at(-1)?.trim()}
            {/시간표|예상|약/.test(time)
              ? time.includes('배차')
                ? ''
                : time.includes('시간표')
                  ? ' · 시간표'
                  : ' · 예상'
              : ''}
          </Text>
          {time.includes('배차') && <Text style={directionStyle}>배차 기준 예상</Text>}
        </View>
      )}
    </Animated.View>
  );
}
/** 5분 이하에서 원을 줄여 도착이 가까운 항목을 강조한다. */
function ringImage(color: string, seconds: number | null, unavailable: boolean) {
  const tint = /^#[0-9a-f]{6}$/i.test(color) ? color : '#2869DB';
  const progress = seconds === null ? 1 : Math.min(1, Math.max(0, Math.ceil(seconds / 60) / 5));
  const circumference = 2 * Math.PI * 46;
  const track = 0.82 * circumference;
  const offset = -(0.09 + 0.82 * (1 - progress)) * circumference;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g fill="none" stroke="${tint}" stroke-width="5.5" stroke-linecap="round" transform="rotate(-90 50 50)"><circle cx="50" cy="50" r="46" opacity="0.12" stroke-dasharray="${track} ${circumference}" stroke-dashoffset="${-0.09 * circumference}"/>${progress > 0 ? `<circle cx="50" cy="50" r="46" opacity="${unavailable ? 0.25 : 1}" stroke-dasharray="${track * progress} ${circumference}" stroke-dashoffset="${offset}"/>` : ''}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const s = StyleSheet.create({
  grid: { paddingTop: 14, paddingBottom: 12 },
  remove: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: c.surface,
  },
  close: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 20,
    includeFontPadding: false,
    fontWeight: '600',
  },
  row: { flexDirection: 'row', gap: 12 },
  add: {
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
  },
  plus: { color: c.accent, fontSize: 30, fontWeight: '300', lineHeight: 36 },
  ring: {
    width: '90%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeRing: { borderWidth: 0 },
  empty: { borderColor: '#EAF0F7' },


  timeLoader: { alignItems: 'center', justifyContent: 'center' },
  timeCover: {
    position: 'absolute',
    top: -5,
    left: '11%',
    right: '11%',
    backgroundColor: 'transparent',
    borderRadius: 7,
    overflow: 'hidden',
  },
  time: {
    textAlign: 'center',
    color: c.text,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  identity: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 1 },
  identityTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    maxWidth: '100%',
  },
  title: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '600',
    color: c.text,
    textAlign: 'center',
    maxWidth: '100%',
    lineHeight: 12,
  },
  station: {
    fontSize: 8,
    fontWeight: '500',
    textAlign: 'center',
    color: c.text,
    maxWidth: '100%',
    lineHeight: 10,
  },
  direction: {
    fontSize: 6,
    lineHeight: 8,
    textAlign: 'center',
    color: c.secondaryText,
    maxWidth: '100%',
  },
});
