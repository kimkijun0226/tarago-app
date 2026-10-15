/** @fileoverview 앱에서 사용하는 유일한 Axios 인스턴스. 서버 주소와 공통 타임아웃만 관리하며 기능별 응답 캐시는 Query가 소유한다. */
import { create } from 'axios';

import { API_BASE_URL } from './config';

/** 서버 요청의 기본 주소와 공통 타임아웃을 한곳에서 관리한다. */
export const apiClient = create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
});
