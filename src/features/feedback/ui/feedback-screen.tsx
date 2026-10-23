import { AppHeader } from '@/shared/ui/app-header';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { ImagePickerAsset } from 'expo-image-picker';
import { requireOptionalNativeModule } from 'expo';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { appColors as c } from '@/shared/ui/theme';
import { sendFeedback } from '../api/send-feedback';

/** 제목만으로도 보낼 수 있는 의견 작성 화면. 실패하면 작성 내용과 사진을 유지한다. */
export function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState<ImagePickerAsset | null>(null);
  const mutation = useMutation({
    mutationFn: sendFeedback,
    retry: false,
    onSuccess: () => {
      setTitle('');
      setContent('');
      setImage(null);
      Alert.alert('의견을 보냈어요');
    },
    onError: (error) => {
      const message = isAxiosError(error) ? error.response?.data?.message : undefined;
      Alert.alert(
        '전송 실패',
        typeof message === 'string' ? message : '잠시 후 다시 시도해주세요.',
      );
    },
  });
  async function pickImage() {
    if (!requireOptionalNativeModule('ExponentImagePicker')) {
      Alert.alert(
        '앱 업데이트가 필요해요',
        '사진 첨부는 새로 빌드한 앱에서 사용할 수 있습니다. 제목과 내용은 지금도 보낼 수 있어요.',
      );
      return;
    }
    try {
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024)
        return Alert.alert('5MB 이하의 이미지를 선택해주세요.');
      if (asset.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType))
        return Alert.alert('JPG, PNG, WebP 이미지를 선택해주세요.');
      setImage(asset);
    } catch {
      Alert.alert('사진을 열지 못했어요', '다시 시도해주세요.');
    }
  }
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          s.body,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 96 },
        ]}
      >
        <AppHeader title="의견 보내기" large />
        <View style={s.field}>
          <Text style={s.label}>
            제목 <Text style={s.required}>*</Text>
          </Text>
          <TextInput
            accessibilityLabel="제목, 필수"
            value={title}
            onChangeText={setTitle}
            editable={!mutation.isPending}
            maxLength={100}
            placeholder="예: 서울역 근처에서 위치 알림이 오지 않았어요"
            placeholderTextColor={c.tertiaryText}
            style={s.input}
          />
        </View>
        <View style={s.field}>
          <Text style={s.label}>내용</Text>
          <TextInput
            accessibilityLabel="내용, 선택"
            value={content}
            onChangeText={setContent}
            editable={!mutation.isPending}
            maxLength={5000}
            multiline
            textAlignVertical="top"
            placeholder={
              '예: 오늘 오전 8시쯤 서울역 근처에 도착했는데 설정한 버스 위치 알림이 오지 않았어요. 반경은 200m, 재알림은 5분으로 설정했고 휴대폰의 위치·알림 권한도 켜져 있었어요.\n\n언제, 어디서, 어떤 상황이었는지 알려주시면 도움이 돼요. 불편했던 점이나 바라는 기능도 자유롭게 적어주세요.'
            }
            placeholderTextColor={c.tertiaryText}
            style={[s.input, s.content]}
          />
        </View>
        <View style={s.field}>
          <Text style={s.label}>이미지</Text>
          {image ? (
            <View style={s.preview}>
              <Image source={{ uri: image.uri }} style={s.image} />
              <Pressable
                disabled={mutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="첨부 이미지 삭제"
                hitSlop={10}
                onPress={() => setImage(null)}
                style={s.remove}
              >
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'cancel' }}
                  size={25}
                  tintColor={c.text}
                />
              </Pressable>
            </View>
          ) : (
            <Pressable
              disabled={mutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="이미지 첨부"
              onPress={() => void pickImage()}
              style={s.attach}
            >
              <SymbolView
                name={{ ios: 'photo.badge.plus', android: 'add_photo_alternate' }}
                size={27}
                tintColor={c.accent}
              />
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="의견 보내기"
          disabled={!title.trim() || mutation.isPending}
          onPress={() => {
            Keyboard.dismiss();
            mutation.mutate({ title, content, image });
          }}
          style={[s.send, (!title.trim() || mutation.isPending) && s.disabled]}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={s.sendText}>보내기</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.surface },
  body: { paddingHorizontal: 20, gap: 24 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: c.text },
  required: { color: c.accent },
  input: {
    borderWidth: 1,
    borderColor: c.separator,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: c.text,
    fontSize: 15,
  },
  content: { minHeight: 160 },
  attach: {
    width: 76,
    height: 76,
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: c.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { width: 120, height: 120 },
  image: { width: 120, height: 120, borderRadius: 16 },
  remove: { position: 'absolute', top: 5, right: 5, backgroundColor: c.surface, borderRadius: 15 },
  send: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.4 },
});
