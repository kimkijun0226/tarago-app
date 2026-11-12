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
