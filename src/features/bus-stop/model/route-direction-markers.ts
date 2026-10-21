/** @fileoverview 공식 노선 좌표의 표시용 우측 보정·모서리 곡선·방향 마커를 계산한다. 보정값은 실제 차선 GPS가 아니다. */

type Coordinate = { latitude: number; longitude: number };
type Region = Coordinate & { latitudeDelta: number; longitudeDelta: number };

/**
 * 화면 간격으로 방향 마커를 배치해 선 두께와 무관하게 삼각형 크기를 유지한다.
 * @param points 도로 진행 순서의 좌표.
 * @param zoom 현재 지도 줌. 16 미만이거나 유한하지 않으면 표시하지 않는다.
 * @param region 마커를 표시할 남서쪽 원점의 지도 범위. 생략하면 전체 경로를 대상으로 한다.
 * @returns 경로 누적 거리 기반 ID, 좌표, 북쪽 기준 회전각을 가진 방향 마커.
 */
export function getRouteDirectionMarkers(points: Coordinate[], zoom: number, region?: Region) {
  /** 화면에 표시할 방향 마커의 좌표·각도·거리 기반 ID를 모으는 결과다. */
  const markers: (Coordinate & { angle: number; id: number })[] = [];
  if (zoom < 16 || !Number.isFinite(zoom)) return markers;

  /** 화면 중심 또는 첫 경로점에서 얻은 거리 축척의 기준 위도다. */
  const latitude = region ? region.latitude + region.latitudeDelta / 2 : (points[0]?.latitude ?? 0);

  /** 기준 위도에서 경도 1도를 동서 방향 미터로 환산하는 계수다. */
  const eastScale = 111_320 * Math.cos((latitude * Math.PI) / 180);

  /** 화면상 약 56픽셀 간격에 대응하는 경로상의 미터 거리다. */
  const spacing = (56 * 156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;

  /** 현재까지 순회한 경로 구간의 누적 길이다. */
  let distance = 0;

  /** 다음 방향 마커를 배치할 경로 시작점 기준 누적 거리다. */
  let next = spacing / 2;

  /** i는 현재 경로 점 또는 구간의 순회 인덱스다. */
  for (let i = 1; i < points.length; i++) {
    /** 현재 방향 마커 계산 구간의 시작 좌표와 종료 좌표다. */
    const from = points[i - 1],
      to = points[i];
    if (![from.latitude, from.longitude, to.latitude, to.longitude].every(Number.isFinite))
      continue;

    /** 좌표 차이를 북쪽 방향의 미터 거리로 환산한 값이다. */
    const north = (to.latitude - from.latitude) * 111_320;

    /** 위도에 따른 축척을 적용한 동쪽 방향의 미터 거리다. */
    const east = (to.longitude - from.longitude) * eastScale;

    /** 현재 경로 구간의 미터 길이이며 보간과 방향 계산에 사용한다. */
    const length = Math.hypot(north, east);
    if (length === 0) continue;
    while (next <= distance + length) {
      /** 현재 경로 구간 안의 보간 위치를 나타내는 비율이다. */
      const fraction = (next - distance) / length;

      /** 두 경로점 사이에 보간한 방향 마커의 좌표다. */
      const point = {
        latitude: from.latitude + (to.latitude - from.latitude) * fraction,
        longitude: from.longitude + (to.longitude - from.longitude) * fraction,
      };
      if (
        !region ||
        (point.latitude >= region.latitude &&
          point.latitude <= region.latitude + region.latitudeDelta &&
          point.longitude >= region.longitude &&
          point.longitude <= region.longitude + region.longitudeDelta)
      )
        markers.push({
          ...point,
          angle: ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360,
          id: Math.round(next * 1000),
        });
      next += spacing;
    }
    distance += length;
  }
  return markers;
}

/**
 * 좌회전은 큰 곡선, 우회전은 작은 곡선으로 표시 경로의 모서리를 잇는다.
 * @param points 진행 방향 순서의 표시용 경로 좌표.
 * @returns 회전 구간을 이차 곡선으로 연결한 좌표. 좌표가 세 개 미만이면 원본을 반환한다.
 */
export function roundRouteTurns(points: Coordinate[]) {
  if (points.length < 3) return points;

  /** 기준 위도에서 경도 1도를 동서 방향 미터로 환산하는 계수다. */
  const eastScale = 111_320 * Math.cos((points[0].latitude * Math.PI) / 180);

  /** 모서리 곡선 처리로 얻은 좌표를 순서대로 모으는 결과 배열이다. */
  const result = [points[0]];

  /** i는 현재 경로 점 또는 구간의 순회 인덱스다. */
  for (let i = 1; i < points.length - 1; i++) {
    /** 모서리 곡선 계산에 사용하는 이전 점·회전점·다음 점이다. */
    const previous = points[i - 1],
      corner = points[i],
      next = points[i + 1];

    /** 회전점으로 들어오는 구간의 동서 방향 거리다. */
    const ax = (corner.longitude - previous.longitude) * eastScale;

    /** 회전점으로 들어오는 구간의 남북 방향 거리다. */
    const ay = (corner.latitude - previous.latitude) * 111_320;

    /** 회전점에서 나가는 구간의 동서 방향 거리다. */
    const bx = (next.longitude - corner.longitude) * eastScale;

    /** 회전점에서 나가는 구간의 남북 방향 거리다. */
    const by = (next.latitude - corner.latitude) * 111_320;

    /** 회전점으로 들어오고 나가는 구간 길이이며 곡선 절단 범위를 제한한다. */
    const incoming = Math.hypot(ax, ay),
      outgoing = Math.hypot(bx, by);
    if (incoming === 0 || outgoing === 0) continue;

    /** 들어오는 벡터와 나가는 벡터 사이의 부호 있는 회전각이다. */
    const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    if (Math.abs(turn) < Math.PI / 12 || Math.abs(turn) > Math.PI * 0.9) {
      result.push(corner);
      continue;
    }

    /** 인접 구간 길이를 넘지 않도록 제한한 곡선 시작·종료 절단 거리다. */
    const cut = Math.min(turn > 0 ? 28 : 20, incoming * 0.4, outgoing * 0.4);

    /** 모서리 이전 구간에서 곡선을 시작할 좌표다. */
    const start = {
      latitude: corner.latitude - ((ay / incoming) * cut) / 111_320,
      longitude: corner.longitude - ((ax / incoming) * cut) / eastScale,
    };

    /** 모서리 이후 구간에서 곡선을 끝낼 좌표다. */
    const end = {
      latitude: corner.latitude + ((by / outgoing) * cut) / 111_320,
      longitude: corner.longitude + ((bx / outgoing) * cut) / eastScale,
    };
    result.push(start);

    /** step은 모서리 곡선을 8개 구간으로 나눠 계산하는 샘플 순번이다. */
    for (let step = 1; step <= 8; step++) {
      /** 이차 곡선 좌표를 계산하는 진행 비율과 그 보수다. */
      const t = step / 8,
        u = 1 - t;
      result.push({
        latitude: u * u * start.latitude + 2 * u * t * corner.latitude + t * t * end.latitude,
        longitude: u * u * start.longitude + 2 * u * t * corner.longitude + t * t * end.longitude,
      });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

/** 도로 데이터 접합·우측 보정에서 생긴 작은 고리를 잘라내되 실제 유턴은 보존한다. */
function trimRouteLoops(points: Coordinate[]) {
  if (points.length < 4) return points;
  const scale = 111_320 * Math.cos((points[0].latitude * Math.PI) / 180);
  const result = [...points];
  // 자기 교차가 없는 수 m의 역주행 접합점도 제거하되 실제 회차는 보존한다.
  for (let i = 1; i < result.length - 1; i++) {
    const a = result[i - 1], b = result[i], c = result[i + 1];
    const ax = (b.longitude - a.longitude) * scale;
    const ay = (b.latitude - a.latitude) * 111_320;
    const bx = (c.longitude - b.longitude) * scale;
    const by = (c.latitude - b.latitude) * 111_320;
    const incoming = Math.hypot(ax, ay), outgoing = Math.hypot(bx, by);
    const chord = Math.hypot(ax + bx, ay + by);
    if (ax * bx + ay * by < 0 && Math.min(incoming, outgoing) <= 6 &&
      Math.max(incoming, outgoing) <= 15 && chord >= Math.max(incoming, outgoing) &&
      Math.abs(ax * by - ay * bx) / chord <= 4) {
      result.splice(i, 1);
      i = Math.max(0, i - 2);
    }
  }
  for (let i = 1; i < result.length - 2; i++) {
    const a = result[i - 1], b = result[i];
    const ax = (b.longitude - a.longitude) * scale;
    const ay = (b.latitude - a.latitude) * 111_320;
    const incoming = Math.hypot(ax, ay);
    let distance = 0;
    for (let j = i + 1; j < result.length; j++) {
      const c = result[j - 1], d = result[j];
      const bx = (d.longitude - c.longitude) * scale;
      const by = (d.latitude - c.latitude) * 111_320;
      const outgoing = Math.hypot(bx, by);
      distance += outgoing;
      const determinant = ax * by - ay * bx;
      if (j > i + 1 && Math.abs(determinant) > 1e-8) {
        const dx = (c.longitude - a.longitude) * scale;
        const dy = (c.latitude - a.latitude) * 111_320;
        const t = (dx * by - dy * bx) / determinant;
        const u = (dx * ay - dy * ax) / determinant;
        const loopLength = incoming * (1 - t) + distance - outgoing * (1 - u);
        // 150도 이상 되도는 실제 회차와 긴 왕복 구간은 자르지 않는다.
        if (t > 0 && t < 1 && u > 0 && u < 1 && loopLength <= 60 &&
          (ax * bx + ay * by) / (incoming * outgoing) > -Math.cos(Math.PI / 6)) {
          result.splice(i, j - i, {
            latitude: a.latitude + (b.latitude - a.latitude) * t,
            longitude: a.longitude + (b.longitude - a.longitude) * t,
          });
          i = Math.max(0, i - 2);
          break;
        }
      }
      if (distance > 120) break;
    }
  }
  return result;
}

type OffsetAnchor = { at: number; offset: number; distance: number };

/** 정류장 주변 240m는 보정을 유지하고 이후 120m에 걸쳐 기본 차선 간격으로 복귀한다. */
function localRouteOffset(at: number, before?: OffsetAnchor, after?: OffsetAnchor) {
  if (before && after && at >= before.at && at <= after.at && after.at - before.at <= 480) {
    const t = (at - before.at) / (after.at - before.at);
    return before.offset * (1 - t) + after.offset * t;
  }
  const weight = (anchor?: OffsetAnchor) => anchor
    ? Math.max(0, Math.min(1, (360 - Math.abs(anchor.at - at)) / 120)) : 0;
  const beforeWeight = weight(before), afterWeight = weight(after);
  const total = beforeWeight + afterWeight;
  return ((before?.offset ?? 0) * beforeWeight + (after?.offset ?? 0) * afterWeight
    + 6 * Math.max(0, 1 - total)) / Math.max(1, total);
}

/**
 * 도로 진행 방향의 오른쪽으로만 보정하여 왕복 노선이 서로 교차하지 않게 한다.
 * 원본 공식 좌표는 변경하지 않고 표시용 경로만 만든다.
 * @param points 공식 도로 형상의 진행 순서 좌표.
 * @param stops 표시 경로의 우측 이동량을 추정할 경유 정류장.
 * @returns 유효 좌표를 정리하고 정류장에 맞춰 우측 이동·곡선 처리한 표시 경로.
 */
export function alignRouteToStops(
  points: Coordinate[],
  stops: (Coordinate & { stationSeq: number })[],
) {
  /** 유효하지 않거나 연속 중복된 점을 제외한 표시용 경로 배열이다. */
  const line = trimRouteLoops(points.filter(
    (p, i) =>
      Number.isFinite(p.latitude) &&
      Number.isFinite(p.longitude) &&
      (i === 0 || p.latitude !== points[i - 1].latitude || p.longitude !== points[i - 1].longitude),
  ));
  if (line.length < 2) return line;

  /** 기준 위도에서 경도 1도를 동서 방향 미터로 환산하는 계수다. */
  const eastScale = 111_320 * Math.cos((line[0].latitude * Math.PI) / 180);
  // 직진 교차로의 짧은 좌표 흔들림만 제거하고 실제 회전은 보존한다.

  const sourceLine = [...line];
  const sourceIndices = line.map((_, index) => index);
  /** i는 현재 경로 점 또는 구간의 순회 인덱스다. */
  for (let i = 1; i < line.length - 1; i++) {
    /** 직진 흔들림을 판별할 연속된 이전·현재·다음 경로점이다. */
    const a = line[i - 1],
      b = line[i],
      c = line[i + 1];

    /** 들어오는 구간의 동서·남북 거리 성분이다. */
    const ax = (b.longitude - a.longitude) * eastScale,
      ay = (b.latitude - a.latitude) * 111_320;

    /** 나가는 구간의 동서·남북 거리 성분이다. */
    const bx = (c.longitude - b.longitude) * eastScale,
      by = (c.latitude - b.latitude) * 111_320;

    /** 인접 두 구간을 합친 시작점과 끝점 사이의 직선 거리다. */
    const chord = Math.hypot(ax + bx, ay + by);

    /** 거의 직진인 좌표 흔들림인지 판단하는 두 구간 사이의 각도다. */
    const angle = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
    if (chord > 0 && angle < Math.PI / 9 && Math.abs(ax * by - ay * bx) / chord <= 4) {
      // 이미 지운 점까지 검사해 연속 단순화의 오차가 누적되지 않게 한다.
      const withinRoad = sourceLine.slice(sourceIndices[i - 1] + 1, sourceIndices[i + 1]).every((point) => {
        const x = (point.longitude - a.longitude) * eastScale;
        const y = (point.latitude - a.latitude) * 111_320;
        const t = (x * (ax + bx) + y * (ay + by)) / chord ** 2;
        return t >= 0 && t <= 1 && Math.abs(x * (ay + by) - y * (ax + bx)) / chord <= 4;
      });
      if (!withinRoad) continue;
      line.splice(i, 1);
      sourceIndices.splice(i, 1);
      i = Math.max(0, i - 2);
    }
  }

  /** 경로의 각 점까지 누적된 미터 거리이며 보정 위치의 기준이다. */
  const distances = [0];

  /** i는 현재 경로 점 또는 구간의 순회 인덱스다. */
  for (let i = 1; i < line.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          (line[i].latitude - line[i - 1].latitude) * 111_320,
          (line[i].longitude - line[i - 1].longitude) * eastScale,
        ),
    );

  /** 진행 방향 우측에서 가까운 정류장이 제공하는 거리·이동량 기준점이다. */
  const anchors: OffsetAnchor[] = [];

  /** stop은 공식 경로 우측 이동의 기준점 후보가 되는 현재 경유 정류장이다. */
  for (const stop of stops) {
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) continue;

    /** 현재 정류장에 가장 가까운 유효 우측 경로 투영 후보를 유지한다. */
    let best: { at: number; offset: number; distance: number } = {
      at: 0,
      offset: 0,
      distance: Infinity,
    };

    /** i는 현재 경로 점 또는 구간의 순회 인덱스다. */
    for (let i = 0; i < line.length - 1; i++) {
      /** 좌표 차이를 북쪽 방향의 미터 거리로 환산한 값이다. */
      const north = (line[i + 1].latitude - line[i].latitude) * 111_320;

      /** 위도에 따른 축척을 적용한 동쪽 방향의 미터 거리다. */
      const east = (line[i + 1].longitude - line[i].longitude) * eastScale;

      /** 현재 경로 구간의 미터 길이이며 보간과 방향 계산에 사용한다. */
      const length = Math.hypot(north, east);
      if (length === 0) continue;

      /** 구간 시작점에서 정류장까지의 북쪽 방향 거리다. */
      const sn = (stop.latitude - line[i].latitude) * 111_320;

      /** 구간 시작점에서 정류장까지의 동쪽 방향 거리다. */
      const se = (stop.longitude - line[i].longitude) * eastScale;

      /** 현재 경로 구간 안의 보간 위치를 나타내는 비율이다. */
      const fraction = Math.max(0, Math.min(1, (sn * north + se * east) / length ** 2));

      /** 진행 방향 오른쪽을 양수로 나타내는 횡방향 미터 거리다. */
      const offset = (se * north - sn * east) / length;

      /** 정류장과 경로 구간에 투영한 점 사이의 최단 거리다. */
      const distance = Math.hypot(sn - fraction * north, se - fraction * east);
      // 반대편 정류소나 잘못된 좌표 쪽으로 선을 끌어당기지 않는다.
      if (offset >= 0 && offset <= 30 && distance < best.distance)
        best = {
          at: distances[i] + fraction * length,
          offset,
          distance,
        };
    }
    if (best.distance <= 30) anchors.push(best);
  }
  // 같은 방향으로 재진입하는 도로는 모든 경유에서 같은 정류장 보정 기준을 공유한다.
  const repeatedSegments = new Map<string, number[]>();
  for (let i = 0; i < line.length - 1; i++) {
    const key = `${line[i].latitude},${line[i].longitude}:${line[i + 1].latitude},${line[i + 1].longitude}`;
    const indices = repeatedSegments.get(key) ?? [];
    indices.push(i);
    repeatedSegments.set(key, indices);
  }
  anchors.sort((a, b) => a.at - b.at || a.distance - b.distance || a.offset - b.offset);
  const offsetAt = (at: number) => {
    const next = anchors.findIndex((anchor) => anchor.at > at);
    return next < 0 ? localRouteOffset(at, anchors[anchors.length - 1])
      : localRouteOffset(at, anchors[next - 1], anchors[next]);
  };
  const sharedAnchors = [...anchors];
  for (const indices of repeatedSegments.values()) {
    if (indices.length < 2) continue;
    const sectionAnchors = anchors.flatMap((anchor) => {
      const index = indices.find((i) => anchor.at >= distances[i] && anchor.at <= distances[i + 1]);
      return index === undefined ? [] : [{ ...anchor, along: anchor.at - distances[index] }];
    });
    const first = indices[0];
    const startOffset = offsetAt(distances[first]);
    const endOffset = offsetAt(distances[first + 1]);
    for (const index of indices) {
      sharedAnchors.push(
        { at: distances[index], offset: startOffset, distance: -1 },
        { at: distances[index + 1], offset: endOffset, distance: -1 },
      );
      for (const anchor of sectionAnchors)
        sharedAnchors.push({ at: distances[index] + anchor.along, offset: anchor.offset, distance: anchor.distance });
    }
  }
  // 원래 경유 순서와 무관하게 동일 위치에서는 같은 기준을 선택한다.
  sharedAnchors.sort((a, b) => a.at - b.at || a.distance - b.distance || a.offset - b.offset);

  /** 동일 누적 위치의 정류장 기준점이 겹치지 않도록 정리한 목록이다. */
  const unique = sharedAnchors.filter((a, i) => i === 0 || Math.abs(a.at - sharedAnchors[i - 1].at) > 0.01);

  /** 원래 경로점과 정류장 기준점의 누적 거리를 중복 없이 모은 집합이다. */
  const samples = new Set(distances);

  /** anchor는 보정 경로의 샘플 위치에 포함할 현재 정류장 기준점이다. */
  for (const anchor of unique) {
    samples.add(anchor.at);
    // 긴 공식 구간에도 보정 시작·종료점을 넣어 정류장 영향이 직선 전체로 번지지 않게 한다.
    for (const delta of [-360, -240, 240, 360]) {
      const at = anchor.at + delta;
      if (at > 0 && at < distances[distances.length - 1]) samples.add(at);
    }
  }

  /** 누적 거리 순회 중 현재 경로 구간과 정류장 기준점의 인덱스를 유지한다. */
  let segment = 0,
    anchorIndex = 0;

  /** 각 누적 거리에서 우측 이동량을 적용한 표시용 경로 좌표다. */
  const shifted = [...samples]
    .sort((a, b) => a - b)
    .flatMap((at) => {
      while (segment < line.length - 2 && distances[segment + 1] <= at) segment++;

      /** 현재 경로 구간의 누적 거리 차이다. */
      const span = distances[segment + 1] - distances[segment];

      /** 현재 경로 구간 안의 보간 위치를 나타내는 비율이다. */
      const fraction = span === 0 ? 0 : (at - distances[segment]) / span;
      while (anchorIndex < unique.length - 1 && unique[anchorIndex + 1].at < at) anchorIndex++;

      /** 현재 누적 거리 앞뒤의 정류장 기준점이며 우측 이동량을 보간한다. */
      const before = unique[anchorIndex],
        after = unique[anchorIndex + 1];

      /** 진행 방향 오른쪽을 양수로 나타내는 횡방향 미터 거리다. */
      const offset = localRouteOffset(at, before, after);

      /** 좌표 차이를 북쪽 방향의 미터 거리로 환산한 값이다. */
      const north = (line[segment + 1].latitude - line[segment].latitude) * 111_320;

      /** 위도에 따른 축척을 적용한 동쪽 방향의 미터 거리다. */
      const east = (line[segment + 1].longitude - line[segment].longitude) * eastScale;

      /** 현재 경로 구간의 미터 길이이며 보간과 방향 계산에 사용한다. */
      const length = Math.hypot(north, east);

      /** 진행 방향의 우측 법선 벡터가 갖는 동쪽 성분이다. */
      let normalEast = length ? north / length : 0;

      /** 진행 방향의 우측 법선 벡터가 갖는 북쪽 성분이다. */
      let normalNorth = length ? -east / length : 0;
      if (fraction === 0 && segment > 0) {
        /** 이전 경로 구간의 동서 방향 거리다. */
        const previousEast = (line[segment].longitude - line[segment - 1].longitude) * eastScale;

        /** 이전 경로 구간의 남북 방향 거리다. */
        const previousNorth = (line[segment].latitude - line[segment - 1].latitude) * 111_320;

        /** 이전 경로 구간의 미터 길이이며 법선 정규화에 사용한다. */
        const previousLength = Math.hypot(previousEast, previousNorth);

        /** 이전 구간 우측 단위 법선의 동쪽·북쪽 성분이다. */
        const pe = previousNorth / previousLength,
          pn = -previousEast / previousLength;

        const turn = Math.atan2(
          previousEast * north - previousNorth * east,
          previousEast * east + previousNorth * north,
        );
        // 유턴의 바깥쪽 평행선은 교점 하나로 접지 않고 회차점 주위의 원호로 잇는다.
        if (turn >= Math.PI * 5 / 6) {
          const radius = Math.max(3, offset);
          const startAngle = Math.atan2(pn, pe);
          return Array.from({ length: 17 }, (_, step) => {
            const angle = startAngle + turn * step / 16;
            return {
              latitude: line[segment].latitude + Math.sin(angle) * radius / 111_320,
              longitude: line[segment].longitude + Math.cos(angle) * radius / eastScale,
            };
          });
        }

        /** 두 구간의 평행선 교점을 계산할 때 과도한 모서리 확장을 제한하는 분모다. */
        const denominator = 1 + pe * normalEast + pn * normalNorth;
        if (denominator > 0.5) {
          normalEast = (pe + normalEast) / denominator;
          normalNorth = (pn + normalNorth) / denominator;
        }
      }
      return [{
        latitude:
          line[segment].latitude +
          (line[segment + 1].latitude - line[segment].latitude) * fraction +
          (normalNorth * offset) / 111_320,
        longitude:
          line[segment].longitude +
          (line[segment + 1].longitude - line[segment].longitude) * fraction +
          (normalEast * offset) / eastScale,
      }];
    });
  // 안쪽으로 옮기기 전에 곡선을 만들면 우회전 반경이 역전되어 고리가 생긴다.
  return roundRouteTurns(trimRouteLoops(shifted));
}
