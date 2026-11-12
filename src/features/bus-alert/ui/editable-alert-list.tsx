import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Sortable from 'react-native-sortables';
import * as Haptics from 'expo-haptics';
import Storage from 'expo-sqlite/kv-store';
import { API_STORAGE_SCOPE } from '@/shared/api/config';
import { EditWiggle } from '@/shared/ui/edit-wiggle';

export function EditableAlertList<T extends { id: string }>({ transport, items, disabled, render, scrollableRef, onDragActive, dismissVersion = 0 }: {
  transport: 'bus' | 'subway';
  items: T[];
  disabled: boolean;
  render: (item: T, editing: boolean, beginEditing: () => void) => ReactNode;
  scrollableRef?: import('react-native-reanimated').AnimatedRef<import('react-native').ScrollView>;
  onDragActive?: (active: boolean) => void;
  dismissVersion?: number;
}) {
  const key = `tarago.alert-order.${API_STORAGE_SCOPE}.${transport}`;
  const [ids, setIds] = useState<string[] | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const editing = editingVersion === dismissVersion;
  const [active, setActive] = useState<string>();
  const [width, setWidth] = useState(0);
  const editingRef = useRef<number | null>(null);
  const finishEditing = useCallback(() => {
    editingRef.current = null;
    setEditingVersion(null);
  }, []);
  const beginEditing = () => {
    if (disabled || editingRef.current === dismissVersion) return;
    editingRef.current = dismissVersion;
    setEditingVersion(dismissVersion);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      .catch((error: unknown) => console.warn('알림 편집 진동 실패', error));
  };
  useEffect(() => {
    let alive = true;
    void Storage.getItem(key).then((value) => {
      const saved: unknown = value ? JSON.parse(value) : [];
      if (alive) setIds(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []);
    }).catch((error: unknown) => {
      console.warn('알림 순서 조회 실패', error);
      if (alive) setIds([]);
    });
    return () => { alive = false; };
  }, [key]);
  useFocusEffect(useCallback(() => () => {
    finishEditing();
    setActive(undefined);
    onDragActive?.(false);
  }, [finishEditing, onDragActive]));
  const ordered = useMemo(() => {
    if (!ids?.length) return items;
    const rank = new Map(ids.map((id, index) => [id, index]));
    return [...items].sort((a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1));
  }, [ids, items]);
  return (
    <View style={{ gap: 8, width: '100%' }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && (
        <Sortable.Grid columns={1} rowGap={12} data={ordered} keyExtractor={(item) => item.id}
          scrollableRef={scrollableRef} customHandle sortEnabled={!disabled && ids !== null} dragActivationDelay={editing ? 0 : 350}
          dragActivationFailOffset={editing ? 24 : 5}
          dropAnimationDuration={0} autoScrollEnabled autoScrollActivationOffset={88} autoScrollMaxOverscroll={0}
          enableActiveItemSnap={false} activationAnimationDuration={100} activeItemScale={1}
          onDragStart={({ key: itemKey }) => {
            setActive(itemKey);
            onDragActive?.(true);
            beginEditing();
          }}
          onDragEnd={({ data }) => {
            setActive(undefined);
            onDragActive?.(false);
            if (data === ordered) return;
            const next = data.map((item) => item.id);
            setIds(next);
            try { Storage.setItemSync(key, JSON.stringify(next)); }
            catch (error) { console.warn('알림 순서 저장 실패', error); }
          }}
          renderItem={({ item, index }) => (
            <View style={{ width }} onTouchStart={(event) => event.stopPropagation()}>
              <EditWiggle active={editing && active !== item.id} index={index} amplitude={1}>
                {render(item, editing, beginEditing)}
              </EditWiggle>
            </View>
          )}
        />
      )}
    </View>
  );
}
