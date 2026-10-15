/** @fileoverview 네이티브 스플래시와 React 화면 사이의 시작 전환 오버레이. 위치 조회는 지도 기능이 별도로 담당한다. */
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** 스플래시 전환 애니메이션을 재생할 밀리초 길이다. */
const DURATION = 600;

/**
 * 네이티브 스플래시가 숨겨진 직후 잠깐 보이는 전환 오버레이.
 *
 * 레이아웃이 준비된 다음 스플래시를 숨겨 빈 화면을 피하고,
 * 종료 애니메이션이 끝나면 오버레이를 트리에서 제거한다.
 */
export function AnimatedSplashOverlay() {
  /** 네이티브 스플래시가 숨겨진 뒤 종료 애니메이션을 시작할지 결정하는 상태다. */
  const [animate, setAnimate] = useState(false);

  /** 전환이 끝나면 오버레이를 React 트리에서 제거하기 위한 표시 상태다. */
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  /** 시작과 종료 때만 렌더되는 작은 애니메이션 정의다. 반복되는 큰 계산이 아니어서 useMemo를 추가하지 않는다. */
  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  /** 전환 전후 레이어에서 공통으로 표시할 스플래시 로고다. */
  const image = <Image style={styles.image} source={require('@/assets/images/splash-icon.png')} />;

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}
    >
      {image}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}
    >
      {image}
    </View>
  );
}

/** 로고 크기와 전체 화면 오버레이 배치를 정의한 고정 스타일이다. */
const styles = StyleSheet.create({
  image: {
    width: 76,
    height: 71,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
