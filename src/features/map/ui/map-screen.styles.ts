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
    borderRadius: 24,
    backgroundColor: mapUi.background,
    borderWidth: 1,
    borderColor: mapUi.border,
    zIndex: 25,
    elevation: 6,
    boxShadow: '0 3px 0 #22222212, 0 5px 12px #2222220A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    zIndex: 25,
    left: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: mapUi.background,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  pressed: {
    backgroundColor: mapUi.blueSurface,
    transform: [{ scale: 0.96 }, { translateY: 1 }],
  },
});
