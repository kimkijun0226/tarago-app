import { apiClient } from '@/shared/api/client';
import { alertAuth } from '@/features/bus-alert/api/alerts';
import type { ImagePickerAsset } from 'expo-image-picker';

/** 선택한 로컬 이미지는 서버로만 업로드하며 메일 발송 성공을 기다린다. */
export async function sendFeedback(input: {
  title: string;
  content: string;
  image: ImagePickerAsset | null;
}) {
  const form = new FormData();
  form.append('title', input.title.trim());
  form.append('content', input.content.trim());
  if (input.image)
    form.append('image', {
      uri: input.image.uri,
      name: input.image.fileName ?? 'image.jpg',
      type: input.image.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
  const auth = await alertAuth();
  await apiClient.post('/feedback', form, {
    timeout: 30_000,
    headers: {
      ...auth.headers,
      'Content-Type': 'multipart/form-data',
    },
  });
}
