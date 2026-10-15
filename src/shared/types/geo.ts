/** @fileoverview 지도 SDK와 이동 기능이 함께 사용하는 WGS84 좌표 계약. 특정 기능이나 네이티브 SDK에 의존하지 않는다. */
/** 위도와 경도를 십진수로 표현한다. 위도는 남북, 경도는 동서를 나타낸다. */
export type Point = { latitude: number; longitude: number };
