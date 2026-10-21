/** @fileoverview 지도 위 시트의 공통 제스처·높이·안전 영역을 관리한다. 내부 내용이나 서버 조회는 하위 기능이 담당한다. */
import BottomSheet, {
  BottomSheetHandle,
  type BottomSheetHandleProps,
  type BottomSheetBackgroundProps,
  useBottomSheetSpringConfigs,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  type SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeOut,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from './theme';
import { useSingleStepSheetGesture } from './use-single-step-sheet-gesture';

/** 순서가 SNAPS의 네이티브 인덱스와 대응하는 세 가지 정착 높이. */
export type MapSheetSnap = 'compact' | 'half' | 'full';

/** 네이티브 정착 인덱스와 대응하는 compact·half·full 순서다. */
const SNAPS: MapSheetSnap[] = ['compact', 'half', 'full'];

type MapBottomSheetProps = {
  children: ReactNode;
  /** 화면별로 전달하는 드래그 가능한 툴바다. */
  toolbar?: ReactNode;
  snap?: MapSheetSnap;
  onChangeSnap?: (snap: MapSheetSnap) => void;
  onHeightChange: (height: number) => void;
  /** 지도 버튼이 UI 스레드에서 시트의 실제 위치를 따라가도록 공유한다. */
  animatedPosition?: SharedValue<number>;
  /** 네이티브 시트가 정착한 뒤 목록의 최초 위치를 확정한다. */
  onSettled?: (contentHeight: number) => void;
  /** 시트를 외부 여백 없이 화면 좌우·하단에 붙여 표시할지 여부다. */
  edgeToEdge?: boolean;
  /** 길찾기처럼 고정 헤더가 있을 때 시트가 확장될 수 있는 위쪽 경계다. */
  topInset?: number;
};

/** 기본 배경의 화면 밖 연장 영역을 제외하고 실제 시트 외곽에만 그림자를 그린다. */
function SheetBackground({
  style,
  animatedIndex,
  points,
}: BottomSheetBackgroundProps & { points: number[] }) {
  const bounds = useAnimatedStyle(() => ({
    height: interpolate(animatedIndex.value, [0, 1, 2], points, Extrapolation.CLAMP),
    bottom: undefined,
  }));
  return <Animated.View pointerEvents="none" style={[style, bounds]} />;
}

/**
 * 드래그는 네이티브 애니메이션에 맡기고 정착한 높이만 상위 지도 여백에 전달한다.
 * @param props 시트 내용, 선택 높이, 높이 변경 콜백과 화면 끝까지 확장할지 여부.
 */
export function MapBottomSheet({
  children,
  toolbar,
  snap,
  onChangeSnap,
  onHeightChange,
  animatedPosition,
  onSettled,
  edgeToEdge = false,
  topInset,
}: MapBottomSheetProps) {
  const animationConfigs = useBottomSheetSpringConfigs({
    damping: 28,
    stiffness: 260,
    mass: 0.8,
    overshootClamping: true,
  });
  /** 시트 배경과 핸들 색상, 모서리에 적용할 공통 테마다. */
  const { colors, radius } = useAppTheme();

  /** 툴바 전체 높이를 최소 시트와 목록의 실제 표시 높이에 반영한다. */
  const [toolbarHeight, setToolbarHeight] = useState(0);

  /** 시트 인스턴스의 snapToIndex 명령을 호출한다. 인스턴스는 렌더링 데이터가 아니므로 ref다. */
  const ref = useRef<BottomSheet>(null);

  /** 회전·창 크기 변화에 따라 갱신되는 화면 높이다. 정착 지점을 다시 계산한다. */
  const { height, width } = useWindowDimensions();

  /** 시트가 상태 표시줄과 홈 인디케이터를 피하도록 적용하는 안전 영역이다. */
  const insets = useSafeAreaInsets();

  /** 떠 있는 시트와 화면 하단 사이의 여백이다. */
  const bottomGap = edgeToEdge ? 0 : insets.bottom;

  /** 드래그 진행률을 UI 스레드에서 공유해 여백과 지도 딤이 시트를 따라 움직이게 한다. */
  const animatedIndex = useSharedValue(snap ? SNAPS.indexOf(snap) : 1);
  /** 라이브러리 내부의 위치 transform과 충돌하지 않도록 하단 간격은 바깥 컨테이너에 적용한다. */
  const containerStyle = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, animatedIndex.value - 1));
    const remaining = 1 - t * t * (3 - 2 * t);
    return {
      transform: [
        { translateY: -bottomGap * remaining },
        { scaleX: edgeToEdge ? 1 : 1 - (24 / width) * remaining },
      ],
    };
  });
  const dimStyle = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, animatedIndex.value - 1));
    return { opacity: 0.8 * t * t * (3 - 2 * t) };
  });

  /** 투명한 딤은 투명한 상태에서 종료해야 시트 교체 순간 검정색으로 번쩍이지 않는다. */
  const dimExit = useCallback(() => {
    'worklet';
    const t = Math.max(0, Math.min(1, animatedIndex.value - 1));
    return {
      initialValues: { opacity: 0.8 * t * t * (3 - 2 * t) },
      animations: { opacity: withTiming(0, { duration: 180 }) },
    };
  }, [animatedIndex]);

  /** 기본은 안전 영역이며 길찾기는 실제 헤더 하단을 전달한다. */
  const topBoundary = topInset ?? insets.top + (edgeToEdge ? 0 : 8);

  const hasToolbar = Boolean(toolbar);

  /** 계산 자체는 작지만 같은 높이 배열을 유지해 시트 라이브러리에 불필요한 새 snapPoints를 전달하지 않는다. */
  const points = useMemo(() => {
    /** 회전하거나 화면이 작아져도 헤더 아래에 세 정착 높이가 순서대로 들어가도록 제한한다. */
    const available = Math.max(1, height - topBoundary);
    return [
      Math.min(hasToolbar && toolbarHeight > 0 ? toolbarHeight + 29 : 150, available * 0.3),
      Math.min(height * (edgeToEdge ? 0.5 : 0.47), available * 0.65),
      available,
    ];
  }, [height, topBoundary, edgeToEdge, hasToolbar, toolbarHeight]);

  const background = useCallback(
    (props: BottomSheetBackgroundProps) => <SheetBackground {...props} points={points} />,
    [points],
  );

  const handle = useCallback(
    (props: BottomSheetHandleProps) => (
      <View>
        <BottomSheetHandle
          {...props}
          style={{ paddingVertical: 12 }}
          indicatorStyle={{
            width: 44,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.tertiaryText,
          }}
        />
        <View
          onLayout={(event) => {
            const next = event.nativeEvent.layout.height;
            setToolbarHeight((current) => (Math.abs(current - next) > 0.5 ? next : current));
          }}
        >
          {toolbar}
        </View>
      </View>
    ),
    [colors.tertiaryText, toolbar],
  );

  // 라이브러리가 시트를 이동하고, 이 영역은 보이는 높이만 잘라 목록 뷰포트를 맞춘다.
  const contentStyle = useAnimatedStyle(() => ({
    height: Math.max(
      0,
      interpolate(animatedIndex.value, [0, 1, 2], points, Extrapolation.CLAMP) - 28 - toolbarHeight,
    ),
    overflow: 'hidden',
  }));

  /** 마지막 유효 정착 위치를 기억해 잘못된 닫힘 이벤트에서 복구한다. 중간 드래그마다 React를 다시 렌더할 값이 아니다. */
  const index = useRef(snap ? SNAPS.indexOf(snap) : 1);

  /**
   * 드래그 정착 결과를 지도와 시트 선택 상태에 전달한다. 음수 인덱스는 뒤로가기가 아니라 기존 높이로 복구한다.
   * @param next 네이티브 시트의 정착 인덱스. 포인트 배열에 대응한다.
   */
  const change = useCallback(
    (next: number) => {
      if (next < 0) return;
      index.current = next;
      onHeightChange(points[next]);
      onChangeSnap?.(SNAPS[next]);
      onSettled?.(Math.max(0, points[next] - 28 - toolbarHeight));
    },
    [onHeightChange, onChangeSnap, onSettled, points, toolbarHeight],
  );

  /** 화면 크기·안전 영역으로 정착 높이가 바뀌면 현재 높이를 지도 패딩에 다시 전달한다. 구독을 만들지 않아 해제 작업은 없다. */
  useEffect(() => {
    onHeightChange(points[index.current]);
    onSettled?.(Math.max(0, points[index.current] - 28 - toolbarHeight));
  }, [onHeightChange, onSettled, points, toolbarHeight]);

  return (
    <>
      <Animated.View
        exiting={dimExit}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', zIndex: 20 }, dimStyle]}
      />
      <Animated.View
        exiting={FadeOut.duration(180)}
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 30,
          },
          containerStyle,
        ]}
      >
        <BottomSheet
          ref={ref}
          animatedIndex={animatedIndex}
          animatedPosition={animatedPosition}
          animationConfigs={animationConfigs}
          index={snap ? SNAPS.indexOf(snap) : 1}
          snapPoints={points}
          accessible={false}
          enableDynamicSizing={false}
          detached={true}
          backgroundComponent={background}
          handleComponent={handle}
          enablePanDownToClose={false}
          enableOverDrag={false}
          topInset={topBoundary}
          backgroundStyle={{
            borderRadius: edgeToEdge && snap === 'full' ? 0 : radius.sheet,
            backgroundColor: colors.surface,
            boxShadow: '0px 0px 18px 2px rgba(0, 0, 0, 0.14)',
          }}
          handleStyle={{ paddingVertical: 12 }}
          handleIndicatorStyle={{
            width: 44,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.tertiaryText,
          }}
          enableContentPanningGesture={false}
          enableHandlePanningGesture={true}
          gestureEventsHandlersHook={useSingleStepSheetGesture}
          onChange={change}
        >
          <Animated.View style={contentStyle}>
            <View style={{ flex: 1 }}>{children}</View>
          </Animated.View>
        </BottomSheet>
      </Animated.View>
    </>
  );
}
