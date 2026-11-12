import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRecoveryStore } from '@/shared/model/recovery-store';
import Animated from 'react-native-reanimated';
import { fadeIn, fadeOut, MotionSpinner } from './motion';
import { appColors as colors } from './theme';

/** 실제 복구 중에만 조작을 막고, 실패하면 조작 가능한 토스트로 전환한다. */
export function RecoveryOverlay() {
  const insets = useSafeAreaInsets();
  const notice = useRecoveryStore((state) => state.notice);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const runId = useRef(0);
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    const id = ++runId.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    pending.current = false;
    queueMicrotask(() => {
      if (runId.current === id) { setFailed(false); setBusy(false); }
    });
    retry.current = () => {
      if (!notice?.retry || pending.current) return;
      pending.current = true;
      if (timer) clearTimeout(timer);
      setBusy(true);
      setFailed(false);
      // 느린 연결 때문에 화면을 계속 잠그지 않는다. 진행 중 요청을 중복 실행하지 않는다.
      timer = setTimeout(() => { if (runId.current === id) setBusy(false); }, 8000);
      void Promise.resolve().then(notice.retry).then(() => {
        if (runId.current === id) setFailed(true);
      }).catch(() => {
        if (runId.current === id) setFailed(true);
      }).finally(() => {
        if (timer) clearTimeout(timer);
        pending.current = false;
        if (runId.current === id) setBusy(false);
      });
    };
    return () => { runId.current = id + 1; if (timer) clearTimeout(timer); };
  }, [notice]);

  const content = notice ? (
      <View style={[styles.overlay, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        {busy && <View style={styles.scrim} />}
        <Animated.View entering={fadeIn} exiting={fadeOut} style={styles.toast} accessibilityLiveRegion="polite">
          {busy && <MotionSpinner color={colors.accent} />}
          <Text style={styles.text}>
            {busy ? '연결을 다시 확인하고 있어요' : `오류 · ${notice.message}${failed ? '\n문제가 계속되면 문의해주세요.' : ''}`}
          </Text>
          {!busy && notice.retry && <Pressable accessibilityRole="button" onPress={() => retry.current()}><Text style={styles.action}>{notice.action ?? '재시도'}</Text></Pressable>}
          {!busy && <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/feedback')}><Text style={styles.action}>문의하기</Text></Pressable>}
        </Animated.View>
      </View>
  ) : null;
  return notice && busy ? (
    <Modal transparent visible animationType="fade" onRequestClose={() => {}}>{content}</Modal>
  ) : <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>{content}</View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, justifyContent: 'flex-start', paddingHorizontal: 20 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(27,45,72,0.12)' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.danger, boxShadow: '0px 4px 20px rgba(27,45,72,0.14)' },
  text: { flex: 1, color: colors.danger, fontSize: 14, lineHeight: 20 },
  action: { color: colors.accent, fontSize: 14, paddingVertical: 8 },
});
