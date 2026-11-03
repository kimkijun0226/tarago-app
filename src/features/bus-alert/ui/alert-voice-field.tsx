import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getBusVoicePreview, getVoiceCatalog, voiceUrl } from '../api/notification-voice';
import {
  playVoicePreview,
  playSystemVoicePreview,
  systemVoiceAvailability,
  type SystemVoiceProfile,
  stopVoicePreview,
  supportsNotificationVoice,
  supportsAnnouncerPreview,
  supportsSystemNotificationVoice,
  type VoiceProfile,
} from '../model/notification-voice';
import { alertColors as colors } from './alert-design';

const profiles = [
  { id: 'system-female', name: '기본 여성', description: '기기 기본 여성 음성 · 무료' },
  { id: 'warm-man', name: '기본 남성', description: '낮고 선명한 남성 목소리' },
  { id: 'clear-young', name: '맑은 여성', description: '밝고 또렷한 목소리' },
  { id: 'calm-woman', name: '발랄한 여성', description: '높고 경쾌한 목소리' },
  { id: 'announcer-woman', name: '아나운서 여성', description: '안정감 있고 또렷한 안내 목소리' },
] as const;

export function AlertVoiceField({
  enabled,
  disabled,
  busNumber,
  profile,
  onChange,
  onProfileChange,
}: {
  enabled: boolean;
  disabled?: boolean;
  busNumber?: string;
  profile: VoiceProfile;
  onChange: (enabled: boolean) => void;
  onProfileChange: (profile: VoiceProfile) => void;
}) {
  const system = useQuery({
    queryKey: ['system-voice-availability'],
    queryFn: systemVoiceAvailability,
  });
  const refetchSystem = system.refetch;
  function description(id: VoiceProfile, fallback: string) {
    if (!id.startsWith('system-')) return fallback;
    if (!supportsSystemNotificationVoice) return '새 앱 빌드에서 사용할 수 있어요';
    if (Platform.OS === 'android') return 'Android 기본 성별 음성은 아직 지원하지 않아요';
    if (system.isPending) return '기기 음성 확인 중';
    if (system.isError) return '기기 음성을 확인하지 못했어요';
    if (!system.data?.[id as SystemVoiceProfile])
      return '사용할 수 있는 해당 성별의 한국어 음성이 없어요';
    return fallback;
  }
  const catalog = useQuery({
    queryKey: ['notification-voices'],
    queryFn: ({ signal }) => getVoiceCatalog(signal),
    staleTime: 60_000,
  });
  const busPreview = useMutation({
    mutationFn: ({
      id,
      number,
      signal,
    }: {
      id: VoiceProfile;
      number: string;
      signal: AbortSignal;
    }) => getBusVoicePreview(id, number, signal),
  });
  const [preparing, setPreparing] = useState<VoiceProfile | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const [playing, setPlaying] = useState<VoiceProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRequest = useRef(0);
  const invalidatePreview = useCallback(() => {
    previewAbort.current?.abort();
    return ++previewRequest.current;
  }, []);
  const stop = useCallback(async () => {
    previewAbort.current?.abort();
    const request = ++previewRequest.current;
    setPreparing(null);
    try {
      await stopVoicePreview();
      if (request === previewRequest.current) setPlaying(null);
    } catch {
      if (request === previewRequest.current) setError('미리 듣기를 중지하지 못했어요.');
    }
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void stop();
      else void refetchSystem();
    });
    return () => {
      invalidatePreview();
      subscription.remove();
      void stopVoicePreview().catch(() => {});
    };
  }, [stop, invalidatePreview, refetchSystem]);
  useEffect(() => {
    if (!enabled || disabled) {
      const request = invalidatePreview();
      void stopVoicePreview()
        .then(() => {
          if (request === previewRequest.current) {
            setPlaying(null);
            setPreparing(null);
          }
        })
        .catch(() => {
          if (request === previewRequest.current) setError('미리 듣기를 중지하지 못했어요.');
        });
    }
  }, [enabled, disabled, invalidatePreview]);
  async function preview(id: VoiceProfile) {
    setError(null);
    if (playing === id || preparing === id) {
      await stop();
      return;
    }
    if (id === 'announcer-woman' && !supportsAnnouncerPreview) {
      setError(
        '현재 설치된 앱은 아나운서 재생을 지원하지 않아요. Xcode에서 새로 빌드해 설치해주세요.',
      );
      return;
    }
    const isSystem = id.startsWith('system-');
    const request = invalidatePreview();
    const controller = new AbortController();
    previewAbort.current = controller;
    setPlaying(null);
    setPreparing(id);
    try {
      await stopVoicePreview();
      if (isSystem) {
        setPreparing(null);
        setPlaying(id);
        await playSystemVoicePreview(id as SystemVoiceProfile, busNumber);
        return;
      }
      // 준비된 샘플 재생과 새 문장 합성의 지원 여부는 별개다.
      const reference =
        catalog.data?.profiles.find((item) => item.id === id)?.previewUrl ??
        voiceUrl(`/alerts/voices/${id}/preview`);
      const url =
        busNumber && catalog.data?.available
          ? await busPreview.mutateAsync({ id, number: busNumber, signal: controller.signal })
          : reference;
      if (request !== previewRequest.current) return;
      setPreparing(null);
      setPlaying(id);
      await playVoicePreview(url);
    } catch {
      if (request === previewRequest.current)
        setError(
          id === 'announcer-woman'
            ? '아나운서 음성을 재생하지 못했어요. 연결과 앱 버전을 확인해주세요.'
            : '미리 듣기를 재생하지 못했어요.',
        );
    } finally {
      if (request === previewRequest.current) {
        setPlaying(null);
        setPreparing(null);
      }
    }
  }
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>음성 알림</Text>
        <Switch
          accessibilityLabel="도착정보 음성 알림"
          value={enabled && supportsNotificationVoice}
          disabled={disabled || !supportsNotificationVoice}
          onValueChange={onChange}
          trackColor={{ true: colors.accent }}
        />
      </View>

      <Text style={[styles.description, { lineHeight: 19, paddingBottom: 8 }]}>
        도착 정보를 선택한 목소리로 읽어드려요.
      </Text>
      {enabled && (
        <View>
          {profiles.map((item, index) => (
            <View
              key={item.id}
              style={[styles.row, index < profiles.length - 1 && styles.separator]}
            >
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{
                  checked: profile === item.id,
                  disabled:
                    !!disabled ||
                    !supportsNotificationVoice ||
                    (item.id.startsWith('system-') &&
                      !system.data?.[item.id as SystemVoiceProfile]),
                }}
                disabled={
                  disabled ||
                  !supportsNotificationVoice ||
                  (item.id.startsWith('system-') && !system.data?.[item.id as SystemVoiceProfile])
                }
                onPress={() => onProfileChange(item.id)}
                style={styles.choice}
              >
                <View style={[styles.radio, profile === item.id && styles.selectedRadio]}>
                  <View
                    style={[
                      styles.radioDot,
                      { backgroundColor: profile === item.id ? colors.accent : 'transparent' },
                    ]}
                  />
                </View>
                <View style={styles.voiceText}>
                  <Text
                    numberOfLines={1}
                    style={[styles.name, profile === item.id && styles.selectedName]}
                  >
                    {item.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.optionDescription}>
                    {description(item.id, item.description)}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name} ${playing === item.id ? '재생 중지' : '미리 듣기'}`}
                disabled={
                  disabled ||
                  !supportsNotificationVoice ||
                  (item.id.startsWith('system-')
                    ? !system.data?.[item.id as SystemVoiceProfile]
                    : false)
                }
                onPress={() => {
                  void preview(item.id);
                }}
                style={({ pressed }) => [
                  styles.preview,
                  {
                    opacity:
                      disabled ||
                      !supportsNotificationVoice ||
                      (item.id.startsWith('system-')
                        ? !system.data?.[item.id as SystemVoiceProfile]
                        : false)
                        ? 0.35
                        : pressed
                          ? 0.65
                          : 1,
                  },
                ]}
              >
                <View style={styles.previewIcon}>
                  {preparing === item.id ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <SymbolView
                      name={
                        playing === item.id
                          ? { ios: 'stop.fill', android: 'stop' }
                          : { ios: 'play.fill', android: 'play_arrow' }
                      }
                      size={15}
                      tintColor={colors.accent}
                    />
                  )}
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {!supportsNotificationVoice ? (
        <Text style={styles.description}>음성 알림은 새 앱 빌드에서 사용할 수 있어요.</Text>
      ) : !profile.startsWith('system-') &&
        (catalog.isError || catalog.data?.available === false) ? (
        <Text style={styles.description}>
          현재 음성을 준비할 수 없어 기본 알림음으로 알려드려요.
        </Text>
      ) : null}
      {error && <Text style={styles.description}>{error}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 0 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '600', color: '#182B45' },
  row: { flexDirection: 'row', alignItems: 'center' },
  separator: { borderBottomWidth: 1, borderBottomColor: colors.separator },
  selectedName: { color: colors.accent },
  choice: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 0,
    paddingRight: 6,
    gap: 10,
  },
  voiceText: { flex: 1, gap: 3 },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedRadio: { borderColor: colors.accent },
  radioDot: { width: 6, height: 6, borderRadius: 3 },
  name: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: '#182B45' },
  optionDescription: { fontSize: 11, lineHeight: 14, color: '#63768D' },
  description: { fontSize: 12, color: '#63768D' },
  preview: {
    width: 52,
    minHeight: 52,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
});
