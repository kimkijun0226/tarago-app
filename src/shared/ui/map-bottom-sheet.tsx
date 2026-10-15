/** @fileoverview 지도 위 시트의 공통 제스처·높이·안전 영역을 관리한다. 내부 내용이나 서버 조회는 하위 기능이 담당한다. */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from './theme';

/** 순서가 SNAPS의 네이티브 인덱스와 대응하는 세 가지 정착 높이. */
export type MapSheetSnap = 'compact' | 'half' | 'full';

/** 네이티브 정착 인덱스와 대응하는 compact·half·full 순서다. */
const SNAPS: MapSheetSnap[] = ['compact', 'half', 'full'];

type MapBottomSheetProps = {
  children: ReactNode;
  snap?: MapSheetSnap;
  onChangeSnap?: (snap: MapSheetSnap) => void;
  onHeightChange: (height: number) => void;
  edgeToEdge?: boolean;
  /** 길찾기처럼 고정 헤더가 있을 때 시트가 확장될 수 있는 위쪽 경계다. */
  topInset?: number;
};

/**
 * 드래그는 네이티브 애니메이션에 맡기고 정착한 높이만 상위 지도 여백에 전달한다.
 * @param props 시트 내용, 선택 높이, 높이 변경 콜백과 화면 끝까지 확장할지 여부.
 */
export function MapBottomSheet({
  children,
  snap,
  onChangeSnap,
  onHeightChange,
  edgeToEdge = false,
  topInset,
}: MapBottomSheetProps) {
  /** 시트 배경과 핸들 색상, 모서리에 적용할 공통 테마다. */
  const { colors, radius } = useAppTheme();

  /** 시트 인스턴스의 snapToIndex 명령을 호출한다. 인스턴스는 렌더링 데이터가 아니므로 ref다. */
  const ref = useRef<BottomSheet>(null);

  /** 회전·창 크기 변화에 따라 갱신되는 화면 높이다. 정착 지점을 다시 계산한다. */
  const { height } = useWindowDimensions();

  /** 시트가 상태 표시줄과 홈 인디케이터를 피하도록 적용하는 안전 영역이다. */
  const insets = useSafeAreaInsets();

  /** 기본은 안전 영역이며 길찾기는 실제 헤더 하단을 전달한다. */
  const topBoundary = topInset ?? insets.top + (edgeToEdge ? 0 : 12);

  /** 계산 자체는 작지만 같은 높이 배열을 유지해 시트 라이브러리에 불필요한 새 snapPoints를 전달하지 않는다. */
  const points = useMemo(() => {
    /** 회전하거나 화면이 작아져도 헤더 아래에 세 정착 높이가 순서대로 들어가도록 제한한다. */
    const available = Math.max(1, height - topBoundary - (edgeToEdge ? 0 : insets.bottom + 20));
    return [
      Math.min(150, available * 0.3),
      Math.min(height * (edgeToEdge ? 0.5 : 0.47), available * 0.65),
      available,
    ];
  }, [height, topBoundary, insets.bottom, edgeToEdge]);

  /** 마지막 유효 정착 위치를 기억해 잘못된 닫힘 이벤트에서 복구한다. 중간 드래그마다 React를 다시 렌더할 값이 아니다. */
  const index = useRef(snap ? SNAPS.indexOf(snap) : 1);

  /** 라이브러리가 렌더러 참조를 받으므로 같은 상태에서는 useCallback으로 핸들 컴포넌트 참조를 유지한다. */
  const handle = useCallback(
    () =>
      edgeToEdge && snap === 'full' ? (
        <View />
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <View
            style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: colors.tertiaryText }}
          />
        </View>
      ),
    [colors.tertiaryText, edgeToEdge, snap],
  );

  /**
   * 드래그 정착 결과를 지도와 시트 선택 상태에 전달한다. 음수 인덱스는 뒤로가기가 아니라 기존 높이로 복구한다.
   * @param next 네이티브 시트의 정착 인덱스. 포인트 배열에 대응한다.
   */
  const change = useCallback(
    (next: number) => {
      if (next < 0) {
        ref.current?.snapToIndex(index.current);
        return;
      }
      index.current = next;
      onHeightChange(points[next]);
      onChangeSnap?.(SNAPS[next]);
    },
    [onHeightChange, onChangeSnap, points],
  );

  /** 화면 크기·안전 영역으로 정착 높이가 바뀌면 현재 높이를 지도 패딩에 다시 전달한다. 구독을 만들지 않아 해제 작업은 없다. */
  useEffect(() => {
    onHeightChange(points[index.current]);
  }, [onHeightChange, points]);

  /** 부모가 요청한 정착 높이가 바뀌면 네이티브 시트를 그 위치로 이동한다. 이미 같은 높이면 재명령하지 않는다. */
  useEffect(() => {
    if (snap && SNAPS.indexOf(snap) !== index.current)
      ref.current?.snapToIndex(SNAPS.indexOf(snap));
  }, [snap]);

  return (
    <BottomSheet
      ref={ref}
      index={snap ? SNAPS.indexOf(snap) : 1}
      snapPoints={points}
      accessible={false}
      enableDynamicSizing={false}
      enablePanDownToClose={false}
      bottomInset={edgeToEdge ? 0 : insets.bottom + 8}
      topInset={topBoundary}
      detached={!edgeToEdge}
      style={{ marginHorizontal: edgeToEdge ? 0 : 12 }}
      backgroundStyle={{
        borderRadius: edgeToEdge && snap === 'full' ? 0 : radius.sheet,
        backgroundColor: colors.surface,
      }}
      handleComponent={handle}
      onChange={change}
    >
      {children}
    </BottomSheet>
  );
}
