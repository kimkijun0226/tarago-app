import { AppHeader } from '@/shared/ui/app-header';
import { AlertSetupPreview } from './alert-setup-preview';
import { TransportIcon } from '@/shared/ui/transport-icon';
import type { ComponentProps, ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAppStore } from '@/shared/model/app-store';
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
          minHeight: compact ? 220 : 260,
          opacity: disabled ? 0.4 : 1,
          transform: [{ translateY: pressed ? 2 : 0 }, { scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <AlertSetupPreview transport={transport} kind={kind} />
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
      <AppHeader
        title={
          editing
            ? `${transport === 'bus' ? '버스' : '지하철'} ${kind === 'time' ? '예약' : '위치'} 알림`
            : '예약 추가'
        }
        onBack={onBack}
        backLabel="알림 목록으로 돌아가기"
        disabled={busy}
      />
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
              <TransportIcon
                transport={value}
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
  compact = false,
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
  compact?: boolean;
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
    <View
      style={[
        styles.card,
        styles.savedCard,
        compact && { minHeight: 120, padding: 12, gap: 6, borderRadius: 16 },
        !enabled && styles.dim,
      ]}
    >
      <View style={styles.heading}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} 대상으로 이동`}
          onPress={onOpen}
          style={{ flex: 1, gap: 4 }}
        >
          <Text style={[styles.stationName, compact && { fontSize: 16 }]}>{title}</Text>
          <Text
            numberOfLines={compact ? 1 : undefined}
            style={[styles.help, compact && { fontSize: 12, lineHeight: 16 }]}
          >
            {subtitle}
          </Text>
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
          fontSize: compact ? 15 : 24,
          fontWeight: '600',
          color: colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {summary}
      </Text>
      <Text
        numberOfLines={compact ? 1 : undefined}
        style={[styles.detail, compact && { fontSize: 11 }]}
      >
        {detail}
      </Text>
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
          paddingTop: compact ? 6 : 12,
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
