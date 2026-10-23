import type { Place } from '../api/mobility';

/** 이름의 일치도를 먼저 비교하고 같은 정도로 일치할 때 거리를 사용한다. */
export function compareSearchRelevance(query: string, a: Place, b: Place): number {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');
  const term = normalize(query);
  const score = (place: Place) => {
    const name = normalize(place.name);
    if (name === term) return 0;
    if (name.replace(/역$/, '') === term.replace(/역$/, '')) return 1;
    if (name.startsWith(term)) return 2;
    if (name.includes(term)) return 3;
    return 4;
  };
  const relevance = score(a) - score(b);
  if (relevance) return relevance;
  if (term.endsWith('역')) {
    const station = Number(b.id.startsWith('subway:')) - Number(a.id.startsWith('subway:'));
    if (station) return station;
  }
  return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
}
