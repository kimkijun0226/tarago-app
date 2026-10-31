import { Pressable, StyleSheet, Text, View } from 'react-native';
import { subwayDestinationKey, type subwayAlertOptions } from '../model/subway-direction';
import { alertColors as c } from '@/features/bus-alert/ui/alert-design';

type Value = {
  direction: string;
  destination?: string;
  destinations?: string[];
  nextStationName?: string;
  destinationNames?: string[];
};
/** 방면 선택 후 해당 방면의 행선지만 복수 선택한다. */
export function SubwayDestinationPicker({
  options,
  value,
  onChange,
  disabled = false,
  directionOnly = false,
}: {
  options: ReturnType<typeof subwayAlertOptions>;
  value: Value;
  onChange: (next: Value) => void;
  disabled?: boolean;
  directionOnly?: boolean;
}) {
  const directions = options.filter((option) => option.direction !== 'all' && !option.destination);
  const direction = directions.find((option) => option.direction === value.direction);
  const trains = options.filter(
    (option) => option.direction === value.direction && option.destination,
  );
  const selected = value.destinations ?? (value.destination ? [value.destination] : undefined);
  const all = selected === undefined;
  const chooseDirection = (option: (typeof directions)[number]) =>
    onChange({
      direction: option.direction,
      nextStationName: option.nextStationName,
      destinationNames: option.destinationNames,
    });
  return (
    <View style={s.container}>
      <Text style={s.heading}>방면</Text>
      <View style={s.directions}>
        {directions.map((option) => (
          <Pressable
            key={option.key}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: option.direction === value.direction, disabled }}
            onPress={() => chooseDirection(option)}
            style={[s.direction, option.direction === value.direction && s.active]}
          >
            <Text style={[s.directionTitle, option.direction === value.direction && s.activeText]}>
              {option.title.replace(' · 전체', '')}
            </Text>
            <Text style={s.subtitle}>{option.direction}</Text>
          </Pressable>
        ))}
      </View>
      {direction && !directionOnly ? (
        <>
          <Text style={s.heading}>행선지</Text>
          <Pressable
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: all, disabled }}
            onPress={() =>
              onChange({
                ...value,
                destination: undefined,
                destinations: all ? [] : undefined,
              })
            }
            style={[s.row, all && s.selectedRow]}
          >
            <Text style={[s.label, all && s.activeText]}>상관없음 · 전체</Text>
          </Pressable>
          {trains.map((option) => {
            const checked =
              all ||
              selected.some(
                (name) => subwayDestinationKey(name) === subwayDestinationKey(option.destination!),
              );
            return (
              <Pressable
                key={option.key}
                disabled={disabled}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled }}
                style={[s.row, checked && s.selectedRow]}
                onPress={() => {
                  const current = selected ?? trains.map((train) => train.destination!);
                  const next = checked
                    ? current.filter(
                        (name) =>
                          subwayDestinationKey(name) !== subwayDestinationKey(option.destination!),
                      )
                    : [...current, option.destination!];
                  onChange({
                    ...value,
                    destination: undefined,
                    destinations: next.length === trains.length ? undefined : next,
                  });
                }}
              >
                <Text style={[s.label, checked && s.activeText]}>{option.title}</Text>
              </Pressable>
            );
          })}
        </>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  container: { gap: 8 },
  heading: { fontSize: 14, fontWeight: '600', color: c.text, marginTop: 8 },
  directions: { flexDirection: 'row', gap: 10 },
  direction: {
    flex: 1,
    borderWidth: 2,
    borderColor: c.separator,
    borderRadius: 14,
    padding: 14,
    gap: 4,
    minHeight: 80,
    justifyContent: 'center',
  },
  directionTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  subtitle: { fontSize: 11, color: c.secondaryText },
  active: { backgroundColor: c.accentSurface, borderColor: c.accent },
  activeText: { color: c.accent },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.separator,
  },
  selectedRow: { backgroundColor: c.accentSurface, borderColor: c.accent },
  label: { flex: 1, fontSize: 14, color: c.text },
});
