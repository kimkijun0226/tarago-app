import { StyleSheet, View, type DimensionValue } from 'react-native';
import { appColors as c } from './theme';

/** 실제 콘텐츠의 자리를 유지하는 비대화형 표시이며 재조회 중에는 기존 콘텐츠를 대체하지 않는다. */
export function SkeletonBlock({ width, height = 12 }: { width: DimensionValue; height?: number }) {
  return <View accessible={false} style={[s.block, { width, height }]} />;
}

/** 초기 데이터가 없는 목록에만 사용한다. 화면별 행 구조와 본문의 4·8·16 간격을 따른다. */
export function ListSkeleton({
  variant = 'option',
  rows = 3,
  inset = 0,
}: {
  variant?: 'arrival' | 'alert' | 'option' | 'route' | 'timetable' | 'history';
  rows?: number;
  inset?: number;
}) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="정보 불러오는 중"
      accessibilityState={{ busy: true }}
      pointerEvents="none"
      style={{
        paddingHorizontal: inset,
        gap: variant === 'alert' || variant === 'history' ? 12 : 0,
      }}
    >
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={index}
          importantForAccessibility="no-hide-descendants"
          style={[
            s.row,
            variant === 'arrival' && s.arrival,
            variant === 'alert' && s.alert,
            variant === 'history' && s.history,
            variant === 'route' && s.route,
          ]}
        >
          {variant === 'alert' ? (
            <>
              <View style={s.inline}>
                <SkeletonBlock width={42} height={42} />
                <View style={s.copy}>
                  <SkeletonBlock width="72%" height={16} />
                  <SkeletonBlock width="54%" height={11} />
                </View>
                <SkeletonBlock width={40} height={22} />
              </View>
              <View style={s.inline}>
                <View style={s.copy}>
                  <SkeletonBlock width="78%" height={14} />
                  <SkeletonBlock width="62%" height={11} />
                </View>
                <SkeletonBlock width="32%" height={20} />
              </View>
              <View style={s.inline}>
                <SkeletonBlock width="28%" height={14} />
                <SkeletonBlock width="28%" height={14} />
              </View>
            </>
          ) : variant === 'arrival' ? (
            <>
              <View style={s.inline}>
                <SkeletonBlock width={28} height={16} />
                <SkeletonBlock width={48} height={16} />
                <SkeletonBlock width="30%" height={10} />
              </View>
              <View style={s.inline}>
                <SkeletonBlock width={76} height={20} />
                <SkeletonBlock width={36} height={10} />
                <SkeletonBlock width={64} height={12} />
              </View>
            </>
          ) : variant === 'route' ? (
            <View style={s.inline}>
              <SkeletonBlock width={12} height={12} />
              <View style={s.copy}>
                <SkeletonBlock width="60%" height={14} />
                <SkeletonBlock width="35%" height={10} />
              </View>
            </View>
          ) : variant === 'timetable' ? (
            <View style={s.inline}>
              <SkeletonBlock width={44} height={16} />
              <SkeletonBlock width="48%" height={12} />
              <SkeletonBlock width={32} height={10} />
            </View>
          ) : (
            <>
              <View style={s.inline}>
                <SkeletonBlock width="56%" height={16} />
              </View>
              <SkeletonBlock width="72%" height={11} />
              {variant === 'history' && <SkeletonBlock width="40%" height={11} />}
            </>
          )}
        </View>
      ))}
    </View>
  );
}

/** 실시간 도착 카드와 같은 두 방면·두 열차 영역을 확보한다. */
export function SubwayArrivalSkeleton() {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="열차 도착정보 불러오는 중"
      accessibilityState={{ busy: true }}
      pointerEvents="none"
      style={s.directions}
    >
      {[0, 1].map((index) => (
        <View key={index} importantForAccessibility="no-hide-descendants" style={s.direction}>
          {[0, 1].map((row) => (
            <View key={row} style={s.train}>
              <SkeletonBlock width="48%" height={14} />
              <SkeletonBlock width="34%" height={14} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  block: { borderRadius: 4, backgroundColor: c.separator },
  row: {
    minHeight: 64,
    paddingVertical: 12,
    gap: 8,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.separator,
  },
  arrival: { minHeight: 69, paddingVertical: 9, gap: 4 },
  alert: {
    minHeight: 180,
    padding: 16,
    gap: 14,
    borderBottomWidth: 0,
    borderRadius: 16,
    backgroundColor: c.surface,
  },
  history: {
    minHeight: 120,
    padding: 18,
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.separator,
    backgroundColor: c.surface,
  },
  route: { minHeight: 56, paddingVertical: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  copy: { flex: 1, gap: 4 },
  directions: { flexDirection: 'row', gap: 8 },
  direction: {
    flex: 1,
    minHeight: 106,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.separator,
    borderRadius: 14,
  },
  train: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
