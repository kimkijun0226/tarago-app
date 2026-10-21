/** @fileoverview 앱에서 사용하는 유일한 Axios 인스턴스. 서버 주소와 공통 타임아웃만 관리하며 기능별 응답 캐시는 Query가 소유한다. */
import { create, isAxiosError, isCancel } from 'axios';

import { API_BASE_URL } from './config';

/** 서버 요청의 기본 주소와 공통 타임아웃을 한곳에서 관리한다. */
export const apiClient = create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
});

/** 개발 중 연결 실패와 서버 응답 오류를 구분하되 헤더·쿼리·응답 본문은 기록하지 않는다. */
if (__DEV__) {
  console.info('[API 연결]', API_BASE_URL);

  apiClient.interceptors.response.use(undefined, (error: unknown) => {
    if (isAxiosError(error) && !isCancel(error)) {
      console.warn('[API 요청 실패]', {
        server: API_BASE_URL,
        path: error.config?.url?.split('?')[0],
        status: error.response?.status ?? '응답 없음',
        code: error.code,
      });
    }
    return Promise.reject(error);
  });
}
