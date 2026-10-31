import { AppHeader } from '@/shared/ui/app-header';
import { AlertSetupPreview } from './alert-setup-preview';
import { TransportIcon } from '@/shared/ui/transport-icon';
import { useCallback, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { ensureProximityPermission } from '../model/alert-runtime';
import { showAlertError } from '../model/alert-error-dialog';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, AppState, Pressable, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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
  compact = false,
}: {
  transport: 'bus' | 'subway';
  kind: 'time' | 'location';
  compact?: boolean;
  disabled?: boolean;
}) {
  const startSelection = useAppStore((s) => s.startAlertSelection);
  const [preparing, setPreparing] = useState(false);
  const operation = useRef(false);
  const permission = useQuery({
    queryKey: ['permissions', 'location', 'background'],
    queryFn: () => Location.getBackgroundPermissionsAsync(),
    enabled: kind === 'location',
    retry: false,
  });
  const refetchPermission = permission.refetch;
  useFocusEffect(
    useCallback(() => {
      if (kind !== 'location') return;
      void refetchPermission();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refetchPermission();
      });
      return () => subscription.remove();
    }, [kind, refetchPermission]),
  );
  const beginSelection = async () => {
    if (disabled || operation.current) return;
    operation.current = true;
    setPreparing(true);
    try {
      if (kind === 'location') {
        await ensureProximityPermission();
        await refetchPermission();
      }
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${transport === 'bus' ? '버스' : '지하철'} 알림 추가`}
      accessibilityHint="필요한 권한을 확인한 뒤 지도에서 알림 대상을 선택합니다"
      accessibilityState={{ disabled: disabled || preparing, busy: preparing }}
      disabled={disabled || preparing}
      onPress={() => void beginSelection()}
      style={({ pressed }) => [
        styles.card,
        styles.savedCard,
        {
          borderStyle: 'solid',
          borderWidth: 1,
          borderColor: colors.separator,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          minHeight: compact ? 200 : 220,
          paddingHorizontal: 20,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <AlertSetupPreview
        transport={transport}
        kind={kind}
        needsLocationPermission={kind === 'location' && permission.data?.granted !== true}
        locationPermissionError={kind === 'location' && permission.isError}
        preparing={preparing}
      />
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
                minHeight: 80,
                gap: 12,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                borderWidth: 1,
                borderBottomWidth: 1,
                borderColor: transport === value ? colors.accent : colors.borderStrong,
                backgroundColor: transport === value ? colors.accent : colors.surface,
                opacity: busy ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              <TransportIcon
                transport={value}
                size={28}
                tintColor={transport === value ? colors.onAccent : colors.bodyText}
              />
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                  color: transport === value ? colors.onAccent : colors.bodyText,
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
        compact && { minHeight: 0, padding: 16, gap: 10 },
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
          <Text style={[styles.stationName, compact && { fontSize: 17 }]}>{title}</Text>
          <Text
            numberOfLines={compact ? 1 : undefined}
            style={[styles.help, compact && { fontSize: 13, lineHeight: 18 }]}
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
            trackColor={{ false: colors.borderStrong, true: colors.brand }}
          />
        </View>
      </View>
      <Text
        style={{
          fontSize: compact ? 16 : 24,
          fontWeight: '600',
          color: colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {summary}
      </Text>
      <Text
        numberOfLines={compact ? 1 : undefined}
        style={[styles.detail, compact && { fontSize: 12, lineHeight: 18 }]}
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
          paddingTop: 10,
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
