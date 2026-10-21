/** @fileoverview 정류장 시트의 제목·현재 위치와의 거리·정류장 번호와 닫기 버튼을 표시한다. */
import { SheetToolbar, useAppTheme } from '@/shared/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BusStop } from '../api/get-nearby-bus-stops';

type BusStopSheetHeaderProps = {
  busStop: BusStop;
  distanceMeters: number | null;
  /** 제목을 눌렀을 때 시트를 펼친다. */
  onExpand: () => void;
  /** 정류장 시트를 닫는다. */
  onClose: () => void;
};

/** 조회나 시트 상태를 소유하지 않고 전달받은 정류장 정보만 표시한다. */
export function BusStopSheetHeader({
  busStop,
  distanceMeters,
  onExpand,
  onClose,
}: BusStopSheetHeaderProps) {
  const { colors } = useAppTheme();

  return (
    <SheetToolbar
      onClose={onClose}
      closeLabel="정류장 정보 닫기"
      header={
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="정류장 정보 펼치기"
            onPress={onExpand}
          >
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {busStop.name}
            </Text>
          </Pressable>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            {distanceMeters === null
              ? ''
              : distanceMeters >= 1000
                ? `${(distanceMeters / 1000).toFixed(1)}km · `
                : `${Math.round(distanceMeters)}m · `}
            {busStop.arsIds?.join(', ') || busStop.arsId || '정류장 번호 없음'}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { paddingVertical: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { marginTop: 4, fontSize: 14 },
});
