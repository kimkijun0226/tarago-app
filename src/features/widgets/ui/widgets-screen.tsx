import { ListSkeleton } from '@/shared/ui/loading-skeleton';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  LinearTransition,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  ReduceMotion,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-screens/experimental';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/shared/ui/app-header';
import { appColors as c } from '@/shared/ui/theme';
import { useWidgetSelection, type FavoriteGroup } from '../model/widget-selection';
import { openWidgetTarget } from '../model/open-widget-target';
import type { WidgetTarget } from '../model/widget-configuration';
import { FavoritesGrid } from './favorites-grid';

export function WidgetsScreen() {
  const { groups, busy, hydrated, initialize, error, storageError } = useWidgetSelection();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refreshHeight = useSharedValue(0);
  const refreshSpace = useAnimatedStyle(() => ({ height: refreshHeight.get() }));
  const refresh = async () => {
    if (refreshing) return;
    const startedAt = Date.now();
    setRefreshing(true);
    refreshHeight.set(44);
    try {
      await client.refetchQueries({ type: 'active', predicate: ({ queryKey: key }) =>
        (key[0] === 'bus-stops' && key[2] === 'arrivals') ||
        (key[0] === 'subway' && (key[2] === 'arrivals' || key[2] === 'alert-arrivals')),
      }, { cancelRefetch: false });
    } finally {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, 1000 - (Date.now() - startedAt))));
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      refreshHeight.set(withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
      setRefreshing(false);
    }
  };
  const scrollRef = useAnimatedRef<ScrollView>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [menu, setMenu] = useState<{ group: FavoriteGroup; x: number; y: number } | null>(null);
  const [editingItems, setEditingItems] = useState(false);
  const backgroundTouch = useRef<{ x: number; y: number; editing: boolean } | null>(null);
  const [opening, setOpening] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; title: string } | null>(null);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  const disabled = busy || opening || !hydrated;
  const open = async (item: WidgetTarget) => {
    if (disabled) return;
    setOpening(true);
    try {
      await openWidgetTarget(item);
      useWidgetSelection.getState().setError(null);
    } catch (error) {
      useWidgetSelection
        .getState()
        .setError(error instanceof Error ? error.message : '지도를 열지 못했어요.');
    } finally {
      setOpening(false);
    }
  };
  const add = (group: FavoriteGroup) => {
    if (disabled || !useWidgetSelection.getState().activateGroup(group.id)) return;
    router.push({ pathname: '/widget-add', params: { groupId: group.id } });
  };
  const saveTitle = async () => {
    if (!editing?.title.trim() || busy) return;
    const state = useWidgetSelection.getState();
    const saved = editing.id
      ? await state.renameGroup(editing.id, editing.title)
      : await state.createGroup(editing.title);
    if (saved) setEditing(null);
  };
  const deleteGroup = (group: FavoriteGroup) => {
    setMenu(null);
    Alert.alert('그룹을 삭제할까요?', '이 그룹의 즐겨찾기도 함께 삭제돼요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          void useWidgetSelection.getState().removeGroup(group.id);
        },
      },
    ]);
  };
  return (
    <SafeAreaView
      style={s.page}
      edges={{ top: true, left: true, right: true, bottom: true }}
      onTouchStart={(event) => {
        backgroundTouch.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, editing: editingItems };
      }}
      onTouchEnd={(event) => {
        const start = backgroundTouch.current;
        backgroundTouch.current = null;
        if (start?.editing && Math.hypot(event.nativeEvent.pageX - start.x, event.nativeEvent.pageY - start.y) < 10)
          setEditingItems(false);
      }}
      onTouchMove={(event) => {
        const start = backgroundTouch.current;
        if (start && Math.hypot(event.nativeEvent.pageX - start.x, event.nativeEvent.pageY - start.y) >= 10)
          backgroundTouch.current = null;
      }}
      onTouchCancel={() => { backgroundTouch.current = null; }}
    >
      <View style={s.header}>
        <AppHeader
          title="즐겨찾기"
          titleVisual={
            <Text accessibilityRole="header" style={s.pageTitle}>
              즐겨찾기
            </Text>
          }
        />
        {editingItems && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="즐겨찾기 수정 완료"
            onPress={() => setEditingItems(false)}
            style={s.editDone}
          >
            <Text style={s.action}>완료</Text>
          </Pressable>
        )}
      </View>
      {/* 기본 컨트롤은 제스처만 감지하고, 이 영역이 로딩 표시와 목록 위치를 유지한다. */}
      <Animated.View style={[s.refreshSpace, refreshSpace]}>
        {refreshing && <ActivityIndicator color={c.accent} accessibilityLabel="새로고침 중" />}
      </Animated.View>
      <Animated.ScrollView
        ref={scrollRef}
        style={s.scroll}
        alwaysBounceVertical
        bounces
        scrollEnabled={!refreshing}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => void refresh()}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {(error || storageError) && (
          <Text accessibilityRole="alert" style={s.error}>
            {storageError ?? error}
          </Text>
        )}
        {!hydrated && !storageError && <ListSkeleton rows={4} />}
        {!hydrated && storageError && (
          <Pressable
            disabled={busy}
            onPress={() => {
              void initialize();
            }}
            style={s.retry}
          >
            <Text style={s.action}>다시 시도</Text>
          </Pressable>
        )}
        {groups.map((group) => (
          <Animated.View key={group.id} layout={LinearTransition.duration(280)} style={s.group}>
            <View style={s.groupHeader}>
              <View style={s.groupTitleButton}>
                <Text style={s.groupTitle}>{group.title}</Text>
              </View>
              <Pressable
                disabled={disabled}
                hitSlop={8}
                onPress={(event) => {
                  if (editingItems) {
                    setEditingItems(false);
                    return;
                  }
                  event.currentTarget.measureInWindow((x, y, width, height) =>
                    setMenu({
                      group,
                      x: Math.max(16, Math.min(screenWidth - 224, x + width - 208)),
                      y: Math.max(16, Math.min(screenHeight - 300, y + height + 8)),
                    }),
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel={`${group.title} 그룹 메뉴`}
                style={s.menu}
              >
                <SymbolView
                  name={{ ios: 'ellipsis', android: 'more_horiz' }}
                  size={22}
                  tintColor={c.secondaryText}
                />
              </Pressable>
            </View>
            <FavoritesGrid
              items={group.items}
              columns={group.columns ?? 4}
              editing={editingItems}
              onEdit={() => setEditingItems(true)}
              onCancelEdit={() => setEditingItems(false)}
              scrollableRef={scrollRef}
              onRemove={(item) => {
                Alert.alert(
                  '즐겨찾기를 삭제할까요?',
                  `${item.title} · ${item.stationName}\n${item.directionLabel}`,
                  [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '삭제',
                      style: 'destructive',
                      onPress: () => {
                        void useWidgetSelection.getState().remove(item.id, group.id);
                      },
                    },
                  ],
                );
              }}
              onReorder={(ids) => useWidgetSelection.getState().reorder(ids, group.id)}
              onAdd={() => add(group)}
              onOpen={(item) => {
                void open(item);
              }}
              disabled={disabled}
            />
          </Animated.View>
        ))}
        {hydrated && (
          <Pressable
            disabled={disabled}
            onPress={() => {
              if (editingItems) setEditingItems(false);
              else setEditing({ title: '' });
            }}
            style={s.addGroup}
            accessibilityRole="button"
          >
            <Text style={s.action}>+ 그룹 추가</Text>
          </Pressable>
        )}
      </Animated.ScrollView>
      <Modal
        transparent
        visible={menu !== null}
        animationType="fade"
        onRequestClose={() => setMenu(null)}
      >
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="메뉴 닫기"
            onPress={() => setMenu(null)}
          />
          {menu && (
            <View style={[s.dropdown, { left: menu.x, top: menu.y }]}>
              <View style={s.columnsRow}>
                {([2, 3, 4] as const).map((columns) => (
                  <Pressable
                    key={columns}
                    accessibilityRole="button"
                    accessibilityState={{ selected: (menu.group.columns ?? 4) === columns }}
                    style={[
                      s.columnsButton,
                      (menu.group.columns ?? 4) === columns && s.columnsSelected,
                    ]}
                    onPress={() => {
                      void useWidgetSelection.getState().setColumns(menu.group.id, columns);
                      setMenu(null);
                    }}
                  >
                    <Text
                      style={[
                        s.columnText,
                        (menu.group.columns ?? 4) === columns && s.columnSelectedText,
                      ]}
                    >
                      {columns}칸
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                style={s.menuItem}
                onPress={() => {
                  setEditing({ id: menu.group.id, title: menu.group.title });
                  setMenu(null);
                }}
              >
                <SymbolView name={{ ios: 'pencil', android: 'edit' }} size={18} tintColor={c.accent} />
                <Text style={s.menuText}>그룹 이름 변경</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={[s.menuItem, s.deleteMenuItem]} onPress={() => deleteGroup(menu.group)}>
                <SymbolView name={{ ios: 'trash', android: 'delete' }} size={18} tintColor={c.danger} />
                <Text style={[s.menuText, { color: c.danger }]}>그룹 삭제</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
      <Modal
        transparent
        visible={editing !== null}
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setEditing(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.scrim}
        >
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>
              {editing?.id ? '그룹 이름 변경' : '즐겨찾기 그룹 추가'}
            </Text>
            <TextInput
              autoFocus
              maxLength={40}
              placeholder="예: 집 근처"
              placeholderTextColor={c.tertiaryText}
              accessibilityLabel="즐겨찾기 그룹 이름"
              value={editing?.title ?? ''}
              onChangeText={(title) => setEditing((value) => (value ? { ...value, title } : value))}
              returnKeyType="done"
              onSubmitEditing={() => {
                void saveTitle();
              }}
              editable={!busy}
              style={s.input}
            />
            {storageError && (
              <Text accessibilityRole="alert" style={s.error}>
                {storageError}
              </Text>
            )}
            <View style={s.dialogActions}>
              <Pressable disabled={busy} onPress={() => setEditing(null)} style={s.dialogButton}>
                <Text style={s.cancel}>취소</Text>
              </Pressable>
              <Pressable
                disabled={busy || !editing?.title.trim()}
                onPress={() => {
                  void saveTitle();
                }}
                style={[
                  s.dialogButton,
                  s.save,
                  { opacity: busy || !editing?.title.trim() ? 0.4 : 1 },
                ]}
              >
                <Text style={s.saveText}>{busy ? '저장 중' : '저장'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  refreshSpace: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  pageTitle: {
    width: '100%',
    textAlign: 'center',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '600',
    includeFontPadding: false,
    color: c.text,
  },
  dropdown: {
    position: 'absolute',
    width: 208,
    padding: 8,
    gap: 8,
    borderRadius: 16,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.separator,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  },
  columnsRow: { flexDirection: 'row', gap: 8 },
  columnsButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.separator,
    borderRadius: 14,
    backgroundColor: c.background,
  },
  columnsSelected: { backgroundColor: c.accentSurface, borderColor: c.accent },
  columnText: { color: c.text, fontSize: 14 },
  columnSelectedText: { color: c.accent },
  menuItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: c.accentSurface },
  deleteMenuItem: { backgroundColor: c.background },
  menuText: { fontSize: 14, color: c.text },
  page: { flex: 1, backgroundColor: c.background },
  editDone: {
    position: 'absolute',
    right: 16,
    top: 4,
    minWidth: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.separator,
  },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 16 },
  group: {
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.separator,
    backgroundColor: c.surface,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: c.separator,
  },
  groupTitleButton: { flex: 1, minHeight: 36, justifyContent: 'center' },
  groupTitle: {
    fontSize: 17,
    lineHeight: 22,
    includeFontPadding: false,
    fontWeight: '600',
    color: c.text,
  },
  menu: { width: 36, height: 36, alignItems: 'flex-end', justifyContent: 'center' },
  error: { color: c.danger, fontSize: 13, lineHeight: 18, paddingVertical: 8 },
  retry: { minHeight: 44, justifyContent: 'center' },
  action: { color: c.accent, fontSize: 15, fontWeight: '600' },
  addGroup: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.accentBorder,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialog: { padding: 20, gap: 16, borderRadius: 16, backgroundColor: c.surface },
  dialogTitle: { fontSize: 18, fontWeight: '600', color: c.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 17,
    color: c.text,
  },
  dialogActions: { flexDirection: 'row', gap: 12 },
  dialogButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  cancel: { color: c.secondaryText, fontSize: 16 },
  save: { backgroundColor: c.accent },
  saveText: { color: c.onAccent, fontSize: 16, fontWeight: '600' },
});
