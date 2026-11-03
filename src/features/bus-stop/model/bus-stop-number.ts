/** 서울 ARS의 앞자리 0 유무를 통일하되 번호 없는 승강장은 일치시키지 않는다. */
export function normalizeBusStopNumber(value: string | null | undefined): string | null {
  const number = value?.trim();
  return number && /^\d{1,5}$/.test(number) && !/^0+$/.test(number)
    ? number.padStart(5, '0')
    : null;
}
