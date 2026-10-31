import { useState, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, View } from 'react-native';
import { SubwayDestinationPicker } from './subway-destination-picker';
import { useSubwayStation, useSubwayTimetable } from '../model/use-subway-station';
import { subwayAlertOptions } from '../model/subway-direction';
import { useSubwayArrivals } from '../model/use-subway-arrivals';
import type { SubwayAlertDraft } from '../model/use-subway-alert-screen';
import { alertColors as c } from '@/features/bus-alert/ui/alert-design';

/** 호선 내 방면 필터는 선택 사항이며 모든 방면을 기본으로 지원한다. */
export function SubwayAlertDirectionFields({
  draft,
  setDraft,
  disabled,
}: {
  draft: SubwayAlertDraft;
  setDraft: Dispatch<SetStateAction<SubwayAlertDraft | null>>;
  disabled: boolean;
}) {
  const station = useSubwayStation(draft.stationName);
  const [openedAt] = useState(Date.now);
  const day = new Date(openedAt + 6 * 3_600_000).getUTCDay();
  const timetable = useSubwayTimetable(
    draft.stationName,
    draft.lineId,
    day === 0 ? 'holiday' : day === 6 ? 'saturday' : 'weekday',
  );
  const line = station.data?.lines.find((item) => item.lineId === draft.lineId);
  const live = useSubwayArrivals(draft.stationName);
  const options = subwayAlertOptions(
    line,
    live.data?.arrivals ?? [],
    timetable.data?.directions,
    draft,
  );
  return (
    <View style={s.card}>
      <SubwayDestinationPicker
        options={options}
        value={draft}
        disabled={disabled}
        onChange={(next) =>
          setDraft(
            (current) =>
              current && { ...current, destination: undefined, destinations: undefined, ...next },
          )
        }
      />
    </View>
  );
}
const s = StyleSheet.create({
  card: { padding: 16, borderWidth: 1, borderColor: c.separator, borderRadius: 16 },
});
