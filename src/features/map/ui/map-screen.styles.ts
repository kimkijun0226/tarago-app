import { appShadows } from '@/shared/ui/theme';
/** @fileoverview 지도 화면의 배치와 터치 버튼 스타일. 서버 상태나 지도 선택 로직은 포함하지 않는다. */
import { StyleSheet } from 'react-native';
import { mapUi } from '@/shared/ui/map-design-tokens';

/** 이 컴포넌트의 배치·간격·색상을 정의한 스타일이다. */
export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  locationButton: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: mapUi.background,
    borderWidth: 1,
    borderColor: mapUi.border,
    zIndex: 25,
    elevation: 0,
    boxShadow: '0px 3px 12px rgba(27, 45, 72, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    zIndex: 25,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: mapUi.background,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
    borderWidth: 1,
    borderColor: mapUi.border,
    boxShadow: appShadows.floating,
  },
  pressed: {
    backgroundColor: mapUi.blueSurface,
    transform: [],
  },
});
