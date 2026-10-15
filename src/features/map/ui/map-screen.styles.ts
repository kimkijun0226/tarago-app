/** @fileoverview 지도 화면의 배치와 터치 버튼 스타일. 서버 상태나 지도 선택 로직은 포함하지 않는다. */
import { StyleSheet } from 'react-native';

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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  pressed: {
    opacity: 0.7,
  },
});
