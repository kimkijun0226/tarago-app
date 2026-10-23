import type { ComponentProps, ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAppStore } from '@/shared/model/app-store';
import { AlertHistoryBell } from './alert-history-bell';
import { WEEKDAYS, WEEKDAY_ORDER } from '../model/alert-form';
import { alertColors as colors } from './alert-design';
import { createStyles } from './alert-screen-styles';

const styles = createStyles(colors);

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
        borderRadius: compact ? 12 : 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: plain
          ? 'transparent'
          : warning
            ? colors.warningSurface
            : colors.accentSurface,
        opacity: disabled ? 0.4 : 1,
        transform: [{ translateY: pressed ? 2 : 0 }, { scale: pressed ? 0.97 : 1 }],
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
  compact = false,
}: {
  transport: 'bus' | 'subway';
  kind: 'time' | 'location';
  compact?: boolean;
  disabled?: boolean;
}) {
  const startSelection = useAppStore((s) => s.startAlertSelection);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${transport === 'bus' ? '버스' : '지하철'} 알림 추가`}
      accessibilityHint="지도에서 알림 대상을 선택합니다"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        startSelection({ transport, kind, requestId: String(Date.now()) });
        router.navigate('/');
      }}
      style={({ pressed }) => [
        styles.card,
        styles.savedCard,
        {
          borderStyle: 'dashed',
          borderWidth: 1.5,
          borderColor: colors.accentBorder,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          minHeight: compact ? 132 : 240,
          opacity: disabled ? 0.4 : 1,
          transform: [{ translateY: pressed ? 2 : 0 }, { scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 24,
          backgroundColor: colors.accentSurface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SymbolView name={{ ios: 'plus', android: 'add' }} size={30} tintColor={colors.accent} />
      </View>
      <Text style={styles.help}>지도에서 선택해주세요</Text>
    </Pressable>
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
        minHeight: 54,
        borderRadius: 20,
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.accent,
        borderBottomWidth: pressed ? 1 : 4,
        borderBottomColor: colors.accentActive,
        opacity: busy ? 0.6 : 1,
        transform: [{ translateY: pressed ? 2 : 0 }],
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
  onTransportChange,
  kind,
}: {
  transport: 'bus' | 'subway';
  kind: 'time' | 'location';
  onTransportChange: (transport: 'bus' | 'subway') => void;
  editing: boolean;
  busy: boolean;
  onBack: () => void;
}) {
  return (
    <View style={{ gap: 20 }}>
      <View style={styles.heading}>
        {editing && (
          <AlertIconButton
            plain
            name={{ ios: 'chevron.left', android: 'arrow_back' }}
            label="알림 목록으로 돌아가기"
            onPress={onBack}
            disabled={busy}
          />
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Text accessibilityRole="header" style={styles.title}>
            {editing
              ? `${transport === 'bus' ? '버스' : '지하철'} ${kind === 'time' ? '시간' : '위치'} 알림`
              : '나의 알림'}
          </Text>
        </View>
        {!editing && <AlertHistoryBell disabled={busy} />}
      </View>
      {!editing && (
        <View style={styles.heading}>
          {(['bus', 'subway'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: transport === value }}
              disabled={busy}
              onPress={() => onTransportChange(value)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 104,
                gap: 10,
                padding: 16,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 24,
                borderWidth: 1.5,
                borderBottomWidth: transport === value && !pressed ? 4 : 1.5,
                borderColor: transport === value ? colors.accentBorder : colors.separator,
                backgroundColor:
                  transport === value ? colors.accentSurface : colors.secondarySurface,
                transform: [{ translateY: pressed ? 2 : 0 }, { scale: pressed ? 0.98 : 1 }],
              })}
            >
              <SymbolView
                name={
                  value === 'bus'
                    ? { ios: 'bus.fill', android: 'directions_bus' }
                    : { ios: 'tram.fill', android: 'tram' }
                }
                size={30}
                tintColor={transport === value ? colors.accent : colors.secondaryText}
              />
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: '600',
                  color: transport === value ? colors.accent : colors.secondaryText,
                }}
              >
                {value === 'bus' ? '버스' : '지하철'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
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
          opacity: disabled ? 0.4 : 1,
          transform: [{ translateY: pressed ? 2 : 0 }, { scale: pressed ? 0.97 : 1 }],
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
            { opacity: disabled ? 0.4 : 1, transform: [{ translateY: pressed ? 2 : 0 }] },
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

export function AlertNotice({
  children,
  action,
  onAction,
  disabled,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.warning}>
      <Text style={styles.warningText}>{children}</Text>
      {action && (
        <Pressable accessibilityRole="button" disabled={disabled} onPress={onAction}>
          <Text style={styles.link}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** 버스·지하철 목록이 공유하는 카드. 실제 저장과 삭제는 각 도메인 훅이 수행한다. */
export function SavedAlertCard({
  title,
  subtitle,
  summary,
  detail,
  arrivals,
  enabled,
  busy,
  onToggle,
  onOpen,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  summary: string;
  detail: string;
  arrivals: ReactNode;
  enabled: boolean;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.card, styles.savedCard, !enabled && styles.dim]}>
      <View style={styles.heading}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} 대상으로 이동`}
          onPress={onOpen}
          style={{ flex: 1, gap: 4 }}
        >
          <Text style={styles.stationName}>{title}</Text>
          <Text style={styles.help}>{subtitle}</Text>
        </Pressable>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Switch
            accessibilityLabel={`${title} ${subtitle} 알림 사용`}
            disabled={busy}
            value={enabled}
            onValueChange={onToggle}
            trackColor={{ true: colors.accent }}
          />
        </View>
      </View>
      <Text
        style={{
          fontSize: 24,
          fontWeight: '600',
          color: colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {summary}
      </Text>
      <Text style={styles.detail}>{detail}</Text>
      {!enabled && (
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>일시정지</Text>
        </View>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          borderTopWidth: 1,
          borderTopColor: colors.separator,
          paddingTop: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} 도착정보 열기`}
          onPress={onOpen}
          style={{ flex: 1, minWidth: 0 }}
        >
          {arrivals}
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <AlertIconButton
            compact
            name={{ ios: 'pencil', android: 'edit' }}
            label={`${title} 알림 수정`}
            disabled={busy}
            onPress={onEdit}
          />
          <AlertIconButton
            compact
            name={{ ios: 'trash', android: 'delete_outline' }}
            label={`${title} 알림 삭제`}
            disabled={busy}
            onPress={onDelete}
          />
        </View>
      </View>
    </View>
  );
}

/** 두 종류를 독립 선택하되 최소 하나는 유지한다. */
export function AlertModes({
  scheduledEnabled,
  proximityEnabled,
  onChange,
  disabled,
}: {
  scheduledEnabled: boolean;
  proximityEnabled: boolean;
  onChange: (modes: { scheduledEnabled: boolean; proximityEnabled: boolean }) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.chips}>
        <AlertChoice
          label="시간 알림"
          selected={scheduledEnabled}
          disabled={disabled || (scheduledEnabled && !proximityEnabled)}
          onPress={() => onChange({ scheduledEnabled: !scheduledEnabled, proximityEnabled })}
        />
        <AlertChoice
          label="위치 알림"
          selected={proximityEnabled}
          disabled={disabled || (proximityEnabled && !scheduledEnabled)}
          onPress={() => onChange({ scheduledEnabled, proximityEnabled: !proximityEnabled })}
        />
      </View>
    </View>
  );
}
