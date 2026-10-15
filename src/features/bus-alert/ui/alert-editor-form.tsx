/** @fileoverview 알림 초안의 필드와 도착정보 미리보기를 표시한다. 서버 저장과 권한 요청은 화면이 담당한다. */
import { memo, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { groupBusArrivals, formatEta } from '@/features/bus-stop/model/bus-arrival';
import { useAppTheme } from '@/shared/ui';
import type { AlertStop, BusAlertInput } from '../model/bus-alert';
import { AlertTimeField } from './alert-time-field';
import { createStyles } from './alert-screen-styles';

/** 조회 전에도 같은 빈 배열 참조를 사용해 노선 그룹 계산의 불필요한 재실행을 줄인다. */
const EMPTY_ARRIVALS: import('../../bus-stop/api/get-bus-arrivals').BusArrival[] = [];

/** 서버의 일요일 0 기준 요일 번호를 한국어 표시명으로 바꾼다. */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 서버 입력에 화면에서 표시할 정류소·노선과 편집 대상 ID를 더한 로컬 초안이다. */
export type AlertDraft = BusAlertInput & { id?: string; stop: AlertStop; busNumber: string };
type Props = {
  draft: AlertDraft;
  setDraft: Dispatch<SetStateAction<AlertDraft | null>>;
  kind: 'time' | 'location';
  threshold: string;
  setThreshold: Dispatch<SetStateAction<string>>;
};

/** 편집 값을 부모 초안으로 돌려보내며 선택한 시간 알림의 도착정보만 조회한다. */
export function AlertEditorForm({ draft, setDraft, kind, threshold, setThreshold }: Props) {
  /** 현재 테마의 의미별 색상을 읽어 밝은 모드와 어두운 모드에 같은 화면 규칙을 적용한다. */
  const { colors } = useAppTheme();

  /** 팔레트가 같으면 스타일 계산 결과를 재사용한다. */
  const styles = useMemo(() => createStyles(colors), [colors]);

  /** 선택한 시간 알림 정류소의 도착정보와 로딩·오류·수동 갱신 상태다. 위치 알림에서는 조회하지 않는다. */
  const {
    data: arrivals = EMPTY_ARRIVALS,
    isError: arrivalError,
    isFetching: arrivalLoading,
    refetch: refreshArrivals,
  } = useBusArrivals(kind === 'time' ? draft.stationId : '');

  /** 도착 배열이 바뀔 때만 노선별 그룹 계산을 다시 수행한다. */
  const arrivalGroups = useMemo(() => groupBusArrivals(arrivals), [arrivals]);

  /** setDraft가 같으면 선택 칩에 안정적인 함수를 전달하고 함수형 갱신으로 최신 초안의 요일을 반전한다. */
  const toggleDay = useCallback(
    (day: number) =>
      setDraft(
        (current) =>
          current && {
            ...current,
            days: current.days.includes(day)
              ? current.days.filter((d) => d !== day)
              : [...current.days, day].sort(),
          },
      ),
    [setDraft],
  );

  /** setThreshold가 같으면 분 선택 칩에 전달할 참조를 유지하며 입력 문자열로 변환한다. */
  const changeThreshold = useCallback(
    (value: number) => setThreshold(String(value)),
    [setThreshold],
  );

  /** setDraft가 같으면 거리 선택 칩의 참조를 유지하며 함수형 갱신으로 최신 초안의 반경만 변경한다. */
  const changeRadius = useCallback(
    (radius: number) => setDraft((current) => current && { ...current, radius }),
    [setDraft],
  );

  // 요일·단계 선택 여부는 작은 배열 조회라 별도 메모 캐시 없이 현재 초안에서 계산한다.
  return (
    <>
      <View style={styles.stationCard}>
        <Text style={styles.stationName}>{draft.stop.name}</Text>
        <Text style={styles.busNumber}>{draft.busNumber}번 버스</Text>
        <Text style={styles.help}>선택한 정류소와 진행 방향으로 알림을 설정해요.</Text>
      </View>
      {kind === 'time' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>버스 시간 알림</Text>
          <>
            <Text style={styles.label}>반복 요일</Text>
            <View style={styles.weekdays}>
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <Choice
                  key={day}
                  label={WEEKDAYS[day]}
                  selected={draft.days.includes(day)}
                  value={day}
                  onSelect={toggleDay}
                />
              ))}
            </View>
            <Text style={styles.label}>감시 시간 · 한국 시간</Text>
            <View style={{ gap: 12 }}>
              <AlertTimeField
                label="시작"
                value={draft.startTime}
                onChange={(value) => setDraft({ ...draft, startTime: value })}
              />
              <AlertTimeField
                label="종료"
                value={draft.endTime}
                onChange={(value) => setDraft({ ...draft, endTime: value })}
              />
            </View>
            <Text style={styles.help}>종료가 시작보다 이르면 다음 날까지 감시해요.</Text>
          </>
        </View>
      )}
      {kind === 'time' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>알림 시점</Text>
          <>
            <Text style={styles.label}>버스 도착 몇 분 전에 알려드릴까요?</Text>
            <View style={styles.chips}>
              {[1, 3, 5, 10].map((value) => (
                <Choice
                  key={value}
                  label={`${value}분 전`}
                  selected={threshold === String(value)}
                  value={value}
                  onSelect={changeThreshold}
                />
              ))}
            </View>
            <View style={styles.inline}>
              <TextInput
                accessibilityLabel="직접 입력한 도착 알림 기준 분"
                value={threshold}
                onChangeText={setThreshold}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.numberInput}
                placeholderTextColor={colors.tertiaryText}
                selectionColor={colors.accent}
              />
              <Text style={styles.help}>분 전 · 1~30분 직접 입력</Text>
            </View>
            <Text style={styles.help}>
              앱을 닫아도 알려드려요. 알림 연결을 완료하면 예약한 시간에 알림을 받을 수 있어요.
            </Text>
            <Text style={styles.label}>단계별 알림 · 도착 예정 두 대</Text>
            <View style={styles.chips}>
              {[...new Set([Number(threshold), 3, 2, 1, 0])]
                .filter(
                  (stage) => Number.isInteger(stage) && stage >= 0 && stage <= Number(threshold),
                )
                .map((stage) => (
                  <Pressable
                    key={stage}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: (
                        draft.notificationStages ?? [Number(threshold), 3, 2, 1, 0]
                      ).includes(stage),
                    }}
                    onPress={() =>
                      setDraft((current) => {
                        if (!current) return current;

                        /** 현재 초안에 저장한 알림 단계이며 없으면 기준 분과 기본 단계로 선택을 복원한다. */
                        const selected = current.notificationStages ?? [
                          Number(threshold),
                          3,
                          2,
                          1,
                          0,
                        ];
                        return {
                          ...current,
                          notificationStages: selected.includes(stage)
                            ? selected.filter((s) => s !== stage)
                            : [...selected, stage],
                        };
                      })
                    }
                  >
                    <Text style={styles.link}>
                      {(draft.notificationStages ?? [Number(threshold), 3, 2, 1, 0]).includes(stage)
                        ? '✓ '
                        : ''}
                      {stage === 0 ? '곧 도착' : `${stage}분`}
                    </Text>
                  </Pressable>
                ))}
            </View>
            <Text style={styles.help}>
              두 대를 한 알림에 표시하고 첫 번째 버스의 단계가 바뀔 때만 알려드려요. 첫 차량이
              지나가면 다음 차량으로 이어져요. 곧 도착은 예상 30초 이내예요.
            </Text>
          </>
        </View>
      )}
      {kind === 'time' && (
        <View style={styles.card}>
          <Toggle
            title="차량번호 표시"
            description="공급자가 제공하는 번호판 정보를 알림에 표시해요."
            value={draft.showVehicleNumber !== false}
            onChange={(value) => setDraft({ ...draft, showVehicleNumber: value })}
          />
        </View>
      )}
      {kind === 'location' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>위치 기반 알림</Text>
          <Text style={styles.label}>접근 알림을 받을 요일</Text>
          <View style={styles.weekdays}>
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <Choice
                key={day}
                label={WEEKDAYS[day]}
                selected={draft.days.includes(day)}
                value={day}
                onSelect={toggleDay}
              />
            ))}
          </View>
          <>
            <Text style={styles.label}>정류소까지 거리</Text>
            <View style={styles.chips}>
              {[100, 200, 300, 500].map((radius) => (
                <Choice
                  key={radius}
                  label={`${radius}m`}
                  selected={draft.radius === radius}
                  value={radius}
                  onSelect={changeRadius}
                />
              ))}
            </View>
            <Text style={styles.help}>
              선택한 요일에 이 정류장에 접근하면 {draft.busNumber}번 버스의 1시간 감시를 시작할지
              묻습니다. 동의하기 전에는 감시하지 않습니다.
            </Text>
            <Text style={styles.help}>
              백그라운드 감지를 위해 위치 ‘항상 허용’이 필요해요. 감지 시점은 GPS와 기기 절전 설정에
              따라 달라질 수 있어요.
            </Text>
          </>
        </View>
      )}
      {kind === 'time' && (
        <View style={styles.card}>
          <View style={styles.heading}>
            <Text style={styles.sectionTitle}>현재 도착정보</Text>
            <Pressable disabled={arrivalLoading} onPress={() => void refreshArrivals()}>
              <Text style={styles.link}>새로고침</Text>
            </Pressable>
          </View>
          {arrivalError ? (
            <Text style={styles.warningText}>도착정보를 불러오지 못했어요.</Text>
          ) : arrivalLoading && !arrivals.length ? (
            <ActivityIndicator />
          ) : !arrivals.length ? (
            <Text style={styles.help}>현재 도착정보가 없습니다.</Text>
          ) : (
            arrivalGroups.map((group) => (
              <View key={`${group.routeId}:${group.stationSeq}`} style={styles.liveRow}>
                <Text style={styles.liveNumber}>{group.busNumber}번</Text>
                <Text style={styles.liveEta}>
                  {formatEta(
                    group.first.etaSeconds,
                    group.first.serviceStatus,
                    group.first.etaPrecision,
                    group.first.etaSource,
                  )}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </>
  );
}

/** 차량번호 설정의 설명과 스위치를 표시한다. memo는 동일한 props의 부모 갱신을 건너뛸 수 있다. */
const Toggle = memo(function Toggle({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  /** 현재 테마의 의미별 색상을 읽어 밝은 모드와 어두운 모드에 같은 화면 규칙을 적용한다. */
  const { colors } = useAppTheme();

  // 작은 스타일 객체 생성은 이 컴포넌트의 렌더에서 바로 수행한다. 별도 캐시가 없고 테마 변경도 즉시 반영된다.
  /** 현재 테마로 생성한 목록·폼의 시각 규칙이다. */
  const styles = createStyles(colors);
  return (
    <View style={styles.heading}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.help}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.success }}
      />
    </View>
  );
});

/** 요일·분·반경 중 하나를 선택하는 칩이다. 안정적인 선택 핸들러와 함께 동일 props 렌더를 줄인다. */
const Choice = memo(function Choice({
  label,
  selected,
  value,
  onSelect,
}: {
  label: string;
  selected: boolean;
  value: number;
  onSelect: (value: number) => void;
}) {
  /** 현재 테마의 의미별 색상을 읽어 밝은 모드와 어두운 모드에 같은 화면 규칙을 적용한다. */
  const { colors } = useAppTheme();

  // 작은 스타일 객체 생성은 이 컴포넌트의 렌더에서 바로 수행한다. 별도 캐시가 없고 테마 변경도 즉시 반영된다.
  /** 현재 테마로 생성한 목록·폼의 시각 규칙이다. */
  const styles = createStyles(colors);

  /** 부모 콜백 또는 선택 값이 바뀔 때만 누름 함수 참조를 갱신한다. */
  const onPress = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selectedChip]}
    >
      <Text style={[styles.chipText, selected && styles.selectedChipText]}>{label}</Text>
    </Pressable>
  );
});
