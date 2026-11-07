/** 지역 호선명을 먼저 대조해 인천1호선을 수도권 1호선과 구분한다. */
export function normalizeSubwayLineName(value: string) {
  const name = value.replace(/\s/g, '').replace(/^수도권/, '');
  const aliases: Record<string, string> = {
    인천선: '인천1호선',
    광역급행철도: 'GTX-A',
    에버라인선: '용인경전철',
    김포골드라인: '김포도시철도',
    의정부선: '의정부경전철',
  };
  return aliases[name] ?? name;
}

export function parseSubwaySymbolCaption(caption: string, lineNames: string[] = []) {
  const compact = caption.replace(/\s/g, '');
  const names = [
    ...new Set(
      ['인천1호선', '인천2호선', '인천선', '수도권광역급행철도', '에버라인선', '김포골드라인', '의정부선', ...lineNames].map((name) => name.replace(/\s/g, '')),
    ),
  ].sort((a, b) => b.length - a.length);
  const token =
    names.find((name) => compact.includes(name)) ?? compact.match(/(?:수도권)?\d+호선/)?.[0];
  return {
    lineName: token ? normalizeSubwayLineName(token) : undefined,
    stationName: compact
      .replace(token ?? '', '')
      .replace(/수도권/g, '')
      .replace(/[()[\]]/g, '')
      .replace(/역$/, ''),
  };
}

/** 호선 없는 지도 심벌은 공식 역 좌표가 충분히 가까우면서 다른 호선과 분리될 때만 연결한다. */
export function resolveSubwaySymbolLine(
  symbol: { caption: string; latitude: number; longitude: number },
  stations: { name: string; lineName: string; latitude: number; longitude: number }[],
) {
  const parsed = parseSubwaySymbolCaption(symbol.caption, stations.map((station) => station.lineName));
  if (parsed.lineName) return parsed.lineName;
  const distances = new Map<string, number>();
  for (const station of stations) {
    if (station.name.replace(/역$/, '') !== parsed.stationName) continue;
    const distance = Math.hypot(
      (station.latitude - symbol.latitude) * 111_320,
      (station.longitude - symbol.longitude) * 111_320 * Math.cos(symbol.latitude * Math.PI / 180),
    );
    const line = normalizeSubwayLineName(station.lineName);
    distances.set(line, Math.min(distances.get(line) ?? Infinity, distance));
  }
  const ranked = [...distances].sort((a, b) => a[1] - b[1]);
  const first = ranked[0];
  if (!first || first[1] > 100 || (ranked[1] && ranked[1][1] - first[1] < 30)) return undefined;
  return first[0];
}
