import { AlertToggle } from './alert-toggle';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SetupHeader } from '@/shared/ui/setup-header';
import { useRecoveryStore } from '@/shared/model/recovery-store';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { AlertSetupPreview } from './alert-setup-preview';
import { TransportIcon } from '@/shared/ui/transport-icon';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ensureProximityPermission } from '../model/alert-runtime';
import { showAlertError } from '../model/alert-error-dialog';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAppStore } from '@/shared/model/app-store';
import { WEEKDAYS, WEEKDAY_ORDER } from '../model/alert-form';
import { alertColors as colors } from './alert-design';
import { createStyles } from './alert-screen-styles';

const styles = createStyles(colors);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 글자 없이 표시하되 스크린 리더에는 동작 이름을 제공한다. */
export function AlertIconButton({
  name,
  label,
  onPress,
  disabled = false,
  warning = false,
  compact = false,
  plain = false,
}: {
  name: ComponentProps<typeof SymbolView>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  warning?: boolean;
  compact?: boolean;
  plain?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={compact ? 6 : undefined}
      style={({ pressed }) => ({
        width: compact ? 32 : 44,
        height: compact ? 32 : 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed && !plain ? colors.secondarySurface : 'transparent',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <SymbolView
        name={name}
        size={compact ? 16 : 21}
        tintColor={warning ? colors.warning : colors.accent}
      />
    </Pressable>
  );
}

/** 빈 목록에서 지도로 이어지는 추가 카드. 새로고침은 페이지 헤더에만 둔다. */
export function EmptyAlertCard({
  transport,
  kind,
  disabled,
  onStart,
}: {
  transport: 'bus' | 'subway';
  kind: 'time' | 'location';
  onStart?: () => void;
  disabled?: boolean;
}) {
  const startSelection = useAppStore((s) => s.startAlertSelection);
  const [preparing, setPreparing] = useState(false);
  const operation = useRef(false);
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: colors.surface,
  }));
  const animatePress = (value: number) => {
    scale.set(
      withTiming(value, {
        duration: 140,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    );
  };
  const beginSelection = async () => {
    if (disabled || operation.current) return;
    operation.current = true;
    setPreparing(true);
    try {
      if (kind === 'location') {
        await ensureProximityPermission();
      }
      onStart?.();
      startSelection({ transport, kind, requestId: String(Date.now()) });
      router.navigate('/');
    } catch (error) {
      showAlertError('위치 알림 설정', error);
    } finally {
      operation.current = false;
      setPreparing(false);
    }
  };
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${transport === 'bus' ? '버스' : '지하철'} ${kind === 'time' ? '예약' : '위치'} 알림 설정하기`}
      accessibilityHint="지도에서 알림 대상을 선택합니다"
      accessibilityState={{ disabled: !!disabled || preparing, busy: preparing }}
      disabled={disabled || preparing}
      onPress={() => void beginSelection()}
      onPressIn={() => animatePress(0.985)}
      onPressOut={() => animatePress(1)}
      style={[
        styles.card,
        {
          flex: 1,
          minHeight: 160,
          padding: 20,
          borderWidth: 1,
          borderColor: colors.separator,
          borderRadius: 18,
          shadowColor: '#203550',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 1,
          opacity: disabled ? 0.4 : 1,
        },
        pressStyle,
      ]}
    >
      <AlertSetupPreview transport={transport} kind={kind} preparing={preparing} />
    </AnimatedPressable>
  );
}

export function AlertPrimaryButton({
  title,
  onPress,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        borderRadius: 14,
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.accent,
        borderWidth: 1,
        borderColor: colors.accent,
        opacity: busy ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '600' }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function AlertPageHeader({
  transport,
  editing,
  busy,
  onBack,
  onDelete,
  kind,
}: {
  transport: 'bus' | 'subway';
  kind: 'time' | 'location';
  onDelete?: () => void;
  editing: boolean;
  busy: boolean;
  onBack: () => void;
}) {
  return (
    <View style={{ gap: 20 }}>
      <SetupHeader
        current={editing ? 2 : 0}
        labels={['알림 종류', '지도 선택', '알림 설정']}
        headerTitle={'알림 추가'}
        title={
          editing
            ? `${transport === 'bus' ? '버스' : '지하철'} 알림을 ${kind === 'time' ? '언제' : '어디에서'} 받을까요?`
            : '어떤 알림을 받을까요?'
        }
        onBack={onBack}
        right={
          onDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="알림 삭제"
              disabled={busy}
              onPress={onDelete}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <SymbolView
                name={{ ios: 'trash', android: 'delete_outline' }}
                size={22}
                tintColor="#E5484D"
              />
            </Pressable>
          ) : undefined
        }
        disabled={busy}
      />
    </View>
  );
}

export function AlertChoice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selectedChip,
        {
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, selected && styles.selectedChipText]}>{label}</Text>
    </Pressable>
  );
}

export function AlertWeekdays({
  days,
  onChange,
  disabled,
}: {
  days: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.weekdays}>
      {WEEKDAY_ORDER.map((day) => (
        <Pressable
          key={day}
          accessibilityRole="button"
          accessibilityLabel={`${WEEKDAYS[day]}요일`}
          accessibilityState={{ selected: days.includes(day), disabled }}
          disabled={disabled}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          onPress={() =>
            onChange(days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort())
          }
          style={({ pressed }) => [
            styles.weekday,
            { opacity: disabled ? 0.4 : pressed ? 0.7 : 1, transform: [] },
          ]}
        >
          <View style={[styles.weekdayCircle, days.includes(day) && styles.selectedChip]}>
            <Text style={[styles.chipText, days.includes(day) && styles.selectedChipText]}>
              {WEEKDAYS[day]}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** 활성 알림에 영향을 주는 오류를 공통 토스트와 동기화한다. */
export function AlertNotice({
  source,
  children,
  action,
  onAction,
}: {
  source: string;
  children: string | null;
  action?: string;
  onAction?: () => void | Promise<unknown>;
  disabled?: boolean;
}) {
  const actionRef = useRef(onAction);
  useEffect(() => {
    actionRef.current = onAction;
  }, [onAction]);
  useEffect(() => {
    const store = useRecoveryStore.getState();
    if (!children) {
      store.clear(source);
      return;
    }
    store.show({
      source,
      message: children,
      retry: async () => {
        await actionRef.current?.();
      },
      action,
    });
  }, [source, children, action]);
  return null;
}

/** 버스·지하철 목록이 공유하는 카드. 실제 저장과 삭제는 각 도메인 훅이 수행한다. */
export function SavedAlertCard({
  title,
  subtitle,
  summary,
  detail,
  arrivals,
  todayControl,
  mode,
  transport,
  enabled,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  compact?: boolean;
  transport: 'bus' | 'subway';
  title: string;
  subtitle: string;
  summary: string;
  detail: string;
  arrivals: ReactNode;
  todayControl: ReactNode;
  mode: 'time' | 'location' | 'both';
  enabled: boolean;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={{ borderRadius: 16, backgroundColor: colors.surface, shadowColor: "#203550", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.045, shadowRadius: 5, elevation: 1 }}>
    <Swipeable
      enabled={!busy}
      friction={1.5}
      rightThreshold={44}
      overshootRight={false}
      containerStyle={{ borderRadius: 16, overflow: 'hidden', backgroundColor: '#E5484D' }}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} 알림 삭제`}
          disabled={busy}
          onPress={onDelete}
          style={{
            width: 88,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: '#E5484D',
          }}
        >
          <SymbolView
            name={{ ios: 'trash', android: 'delete_outline' }}
            size={22}
            tintColor="#FFFFFF"
          />
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>삭제</Text>
        </Pressable>
      )}
    >
      <View style={[styles.card, styles.savedCard, { padding: 16, gap: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title} 알림 수정`}
            onPress={onEdit}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.secondarySurface, alignItems: 'center', justifyContent: 'center' }}>
              <TransportIcon transport={transport} size={26} tintColor={colors.accent} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={{ flexShrink: 1, fontSize: 18, fontWeight: '600', color: colors.text }}
                >
                  {title} {mode === 'both' ? '예약·위치 알림' : mode === 'time' ? '예약 알림' : '위치 알림'}
                </Text>
                {mode !== 'location' && <SymbolView name={{ ios: 'clock', android: 'schedule' }} size={20} tintColor={colors.accent} />}
                {mode !== 'time' && <SymbolView name={{ ios: 'location', android: 'near_me' }} size={20} tintColor={colors.accent} />}
              </View>
              <Text style={{ fontSize: 13, lineHeight: 18, color: colors.secondaryText }}>
                {subtitle}
              </Text>
            </View>
          </Pressable>
          <AlertToggle
            label={`${title} ${subtitle} 전체 알림 활성화`}
            disabled={busy}
            value={enabled}
            onChange={onToggle}
            color={colors.brand}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} 알림 수정`}
          onPress={onEdit}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ flex: 1, gap: 5 }}>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 21,
              fontWeight: '500',
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            {summary}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.secondaryText }}>
            {detail}
          </Text>
          </View>
          <View style={{ width: '43%' }}>{arrivals}</View>
        </Pressable>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTopWidth: 1,
            borderTopColor: colors.separator,
            paddingTop: 8,
            gap: 12,
          }}
        >
          {todayControl}
        </View>
      </View>
    </Swipeable>
    </View>
  );
}

/** 설명은 최종 설정 끝에서 한 번만 표시한다. */
export function AlertSetupNote({
  scheduled,
  proximity,
}: {
  scheduled: boolean;
  proximity: boolean;
}) {
  return (
    <Text style={{ color: colors.secondaryText, fontSize: 13, lineHeight: 20 }}>
      {proximity
        ? scheduled
          ? '정한 시간이나 선택한 장소 근처에서 도착 정보를 알려드려요.'
          : '설정한 반경 안에서 도착 정보를 알려드려요.'
        : '정한 시간에 도착 정보를 알려드려요.'}
    </Text>
  );
}
