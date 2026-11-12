import { useCallback, useMemo, useRef, useState } from 'react';
import Sortable, { type SortableGridRenderItem } from 'react-native-sortables';
import Animated, { LinearTransition, FadeOut, useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay, Easing, type SharedValue, type AnimatedRef } from 'react-native-reanimated';
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
  const suppressTapUntil = useRef(0);
  const lastMoveFeedback = useRef(0);
  const heldId = useSharedValue<string | null>(null);
  const holdScale = useSharedValue(1);
  const holdOrigin = useRef({ x: 0, y: 0 });
  const resetHold = useCallback(() => {
    holdScale.set(withSpring(1, { damping: 24, stiffness: 360, mass: 0.7, overshootClamping: true }));
  }, [holdScale]);
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
  const renderItem = useCallback<SortableGridRenderItem<Cell>>(
    ({ item }) => (
      <Animated.View
        style={{ width: diameter, height: diameter }}
      >
        {item.target && !editing ? (
          <Pressable
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${item.target.title} ${item.target.stationName} 상세 보기`}
            accessibilityHint="길게 누르면 즐겨찾기를 수정할 수 있어요"
            onPress={() => {
              if (item.target && Date.now() > suppressTapUntil.current) onOpen(item.target);
            }}
            delayLongPress={400}
            onLongPress={() => {
              feedback('lift');
              onEdit();
            }}
          >
            <Arrival item={item.target} diameter={diameter} />
          </Pressable>
        ) : item.target ? (
          <View
            onTouchStart={(event) => {
              event.stopPropagation();
              holdOrigin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
            }}
            onTouchMove={(event) => {
              if (!dragging.current && Math.hypot(event.nativeEvent.pageX - holdOrigin.current.x, event.nativeEvent.pageY - holdOrigin.current.y) > 10)
                resetHold();
            }}
            onTouchCancel={resetHold}
          >
            <Sortable.Handle>
              <Sortable.Touchable
                onTouchesDown={() => {
                  if (!disabled && !editing) {
                    heldId.set(item.id);
                    holdScale.set(1);
                    holdScale.set(withDelay(80, withTiming(1.07, { duration: 320, easing: Easing.inOut(Easing.cubic) })));
                  }
                }}
                onTouchesUp={resetHold}
                onTap={() => {
                  if (
                    !disabled &&
                    !editing &&
                    !dragging.current &&
                    Date.now() > suppressTapUntil.current &&
                    item.target
                  )
                    onOpen(item.target);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.target.title} ${item.target.stationName}${editing ? ' 순서 변경' : ' 상세 보기'}`}
                accessibilityHint="길게 누르면 수정 모드에서 순서를 바꾸고 삭제할 수 있어요"
              >
                <HoldScale id={item.id} heldId={heldId} scale={holdScale}>
                  <Arrival item={item.target} diameter={diameter} />
                </HoldScale>
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
            <Pressable
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={editing ? '즐겨찾기 수정 취소' : '즐겨찾기 추가'}
              onTouchStart={(event) => event.stopPropagation()}
              onPress={editing ? onCancelEdit : onAdd}
              style={[s.add, { width: diameter, opacity: editing ? 0.35 : 1 }]}
            >
              <Text style={s.plus}>+</Text>
            </Pressable>
          </Sortable.Handle>
        )}
      </Animated.View>
    ),
    [diameter, disabled, editing, onOpen, onRemove, onAdd, onCancelEdit, onEdit, heldId, holdScale, resetHold],
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
        sortEnabled={editing && !disabled}
        enableActiveItemSnap={false}
        activationAnimationDuration={100}
        dropAnimationDuration={160}
        activeItemScale={1}
        inactiveItemOpacity={0.85}
        dimensionsAnimationType="worklet"
        itemsLayoutTransitionMode="all"
        itemExiting={FadeOut.duration(150)}
        onDragStart={() => {
          dragging.current = true;
          resetHold();
          lastMoveFeedback.current = Date.now();
          onEdit();
          feedback('lift');
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
function HoldScale({ id, heldId, scale, children }: {
  id: string;
  heldId: SharedValue<string | null>;
  scale: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: heldId.value === id ? scale.value : 1 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
function Arrival({ item, diameter }: { item: WidgetTarget; diameter: number }) {
  const { direction, time, color, remainingSeconds, loading, realtimeError } = useWidgetArrival(item);
  const showLoading = loading;
  const title = item.transport === 'subway' && item.expressOnly ? `${item.title} · 급행` : item.title;
  const textScale = Math.max(1, Math.min(2, diameter / 80));
  const directionStyle = [s.direction, { fontSize: 7 * textScale, lineHeight: 9 * textScale }];
  const minutes = time.match(/\d+분/)?.[0];
  const timer =
    remainingSeconds !== null && remainingSeconds > 0
      ? `${Math.floor(remainingSeconds / 60)}:${String(Math.floor(remainingSeconds % 60)).padStart(2, '0')}`
      : null;
  const label = timer ?? minutes ?? time;
  const statusOnly = remainingSeconds === null && !['진입', '도착'].includes(time);
  return (
    <Animated.View
      layout={LinearTransition.duration(280)}
      style={[s.ring, s.activeRing, { width: diameter }]}
      accessibilityLabel={`${title} ${item.stationName} ${direction} ${time}`}
    >
      <Image
        source={{ uri: ringImage(color, remainingSeconds, remainingSeconds === null) }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        cachePolicy="memory"
        transition={150}
        accessible={false}
      />
      {!showLoading && !statusOnly && (
        <View style={[s.timeCover, { maxWidth: diameter * 0.78 }]}>
          <Text
            style={[s.time, { fontSize: 11 * textScale, lineHeight: 13 * textScale }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {label}
          </Text>
        </View>
      )}
      {!showLoading && !statusOnly && (
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
          {realtimeError && <Text style={directionStyle}>실시간 오류 · 의견 보내기</Text>}
        </View>
      )}
      {(showLoading || statusOnly) && (
        <View
          style={s.loadingOverlay}
          pointerEvents="none"
          accessibilityLabel={showLoading ? '정보 가져오는 중' : time}
        >
          <Text
            style={[s.title, { fontSize: 10 * textScale, lineHeight: 12 * textScale }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={[s.loadingText, { fontSize: 9 * textScale, lineHeight: 12 * textScale }]}
            numberOfLines={4}
            adjustsFontSizeToFit
          >
            {showLoading ? '정보\n가져오는 중' : label}
          </Text>
          {!showLoading && realtimeError && (
            <Text style={directionStyle}>실시간 오류 · 의견 보내기</Text>
          )}
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 999,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: c.secondaryText,
    fontSize: 8,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: '72%',
  },
  timeCover: {
    position: 'absolute',
    top: -5,
    alignSelf: 'center',
    backgroundColor: 'transparent',
    borderRadius: 7,
    overflow: 'hidden',
  },
  time: {
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
