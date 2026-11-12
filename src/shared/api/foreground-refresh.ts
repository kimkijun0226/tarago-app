/** Keep pull-to-refresh feedback bounded while active queries update their rows independently. */
export async function waitForForegroundRefresh(request: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      request,
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 2_000); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Live arrival and active timetable queries rendered by the arrival lists. */
export function isArrivalRefreshQuery({ queryKey: key }: { queryKey: readonly unknown[] }) {
  return (key[0] === 'bus-stops' && key[2] === 'arrivals') ||
    (key[0] === 'subway' && (key[2] === 'arrivals' || key[2] === 'alert-arrivals' || key[3] === 'timetable'));
}
