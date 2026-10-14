import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { useMapTabVisibility } from '@/components/map-tab-visibility';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { groupBusArrivals, formatEta } from '@/features/bus-stop/model/bus-arrival';
import { useAlerts, useAlertMutations, usePushStatus } from '../model/use-alerts';
import { ensureNotificationPermission, ensureProximityPermission, preparePush } from '../model/alert-runtime';
import { useAlertRuntimeError } from './alert-runtime-provider';
import type { AlertStop, BusAlert, BusAlertInput } from '../model/bus-alert';
import { AlertTimeField } from './alert-time-field';
import { MonitoringSessionsPanel } from './monitoring-sessions-panel';
import { AppButton, useAppTheme } from '@/shared/ui/design-system';

const EMPTY_ARRIVALS: import('../../bus-stop/api/get-bus-arrivals').BusArrival[] = [];
const WEEKDAYS = ['일','월','화','수','목','금','토'];
type Draft = BusAlertInput & { id?:string; stop:AlertStop; busNumber:string };

/** 알림 목록과 정류소·노선별 편집기를 같은 탭에서 보여준다. */
export default function AlertsScreen() {
  const [openedAt] = useState(() => Date.now());
  const params = useLocalSearchParams<{stationId?:string;stationName?:string;latitude?:string;longitude?:string;routeId?:string;busNumber?:string;stationSeq?:string;requestId?:string;alertId?:string;sourceAlertId?:string;sourceAlertIds?:string;monitoringId?:string}>();
  const {data:alerts=[]} = useAlerts();
  const saved = params.alertId ? alerts.find(a => a.id === params.alertId) : undefined;
  const sourceIds=(params.sourceAlertIds || params.sourceAlertId || '').split(',');
  const sources=alerts.filter(a=>sourceIds.includes(a.id) && a.enabled && a.proximityEnabled);
  let initialDraft:Draft|null = saved ?? null;
  const latitude=Number(params.latitude),longitude=Number(params.longitude);
  if (!params.alertId && params.requestId && params.stationId && params.routeId && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude)<=90 && Math.abs(longitude)<=180) {
    const requestedAt = Number(params.requestId);
    const now = Number.isFinite(requestedAt) && requestedAt > 0 ? requestedAt : openedAt;
    const startTime = new Date(now + 9 * 60 * 60_000).toISOString().slice(11,16);
    const endTime = new Date(now + 11 * 60 * 60_000).toISOString().slice(11,16);
    initialDraft={stationId:params.stationId,routeId:params.routeId,busNumber:params.busNumber ?? params.routeId,
      ...(params.stationSeq ? {stationSeq:Number(params.stationSeq)} : {}),
      stop:{id:params.stationId,name:params.stationName ?? '정류소',latitude,longitude},
      days:[1,2,3,4,5],startTime,endTime,thresholdMinutes:5,scheduledEnabled:true,
      enabled:true,proximityEnabled:false,radius:200,notificationStages:[5,3,2,1,0],showVehicleNumber:true};
  }
  return <AlertsScreenContent key={`${params.requestId ?? ''}:${params.alertId ?? ''}:${Boolean(saved)}`} initialDraft={initialDraft} sources={sources} />;
}

function AlertsScreenContent({initialDraft,sources}:{initialDraft:Draft|null;sources:BusAlert[]}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {setMapTabHidden} = useMapTabVisibility();
  const {data:alerts=[],isPending,isError,refetch} = useAlerts();
  const {data:pushStatus} = usePushStatus();
  const {save,remove} = useAlertMutations();
  const {mutateAsync: saveAsync} = save;
  const {mutateAsync: removeAsync} = remove;
  const runtimeError = useAlertRuntimeError();
  const client = useQueryClient();
  const [draft,setDraft] = useState<Draft|null>(initialDraft);
  const [kind,setKind] = useState<'time'|'location'>(initialDraft?.proximityEnabled && !initialDraft.scheduledEnabled ? 'location' : 'time');
  const [dismissedSource,setDismissedSource] = useState(false);
  const visibleAlerts = alerts.filter(a=>!a.monitoringSourceId && (kind==='time' ? a.scheduledEnabled : a.proximityEnabled));
  const [busy,setBusy] = useState(false);
  const [pushWarning,setPushWarning] = useState<string|null>(null);
  const [threshold,setThreshold] = useState(String(initialDraft?.thresholdMinutes ?? 5));
  const {data:arrivals=EMPTY_ARRIVALS,isError:arrivalError,isFetching:arrivalLoading,refetch:refreshArrivals} = useBusArrivals(kind==='time' ? draft?.stationId ?? '' : '');

  const arrivalGroups = useMemo(() => groupBusArrivals(arrivals), [arrivals]);

  const selectKind = (value:'time'|'location') => {
    setKind(value);
    setDraft(current=>current && ({...current,
      // 방식이 다른 기존 설정은 그대로 두고 새 설정을 만든다.
      id:value===kind ? current.id : undefined,
      scheduledEnabled:value==='time',proximityEnabled:value==='location',monitoringStartedAt:undefined,monitoringEndsAt:undefined,monitoringSourceId:undefined}));
  };
  const toggleDay = useCallback((day: number) => setDraft(current => current && ({...current,
    days: current.days.includes(day) ? current.days.filter(d => d !== day) : [...current.days, day].sort(),
  })), []);
  const changeThreshold = useCallback((value: number) => setThreshold(String(value)), []);
  const changeRadius = useCallback((radius: number) => setDraft(current => current && ({...current, radius})), []);

  const prepare = useCallback(async (input:BusAlertInput) => {
    if (!input.enabled) return;
    await ensureNotificationPermission();
    if (input.proximityEnabled) await ensureProximityPermission();
    if (input.scheduledEnabled) {
      setPushWarning(await preparePush());
      await client.invalidateQueries({queryKey:['alerts','push-status']});
    }
  }, [client]);
  const submit = useCallback(async () => {
    if (!draft || busy) return;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    const minutes = Number(threshold);
    if (!time.test(draft.startTime) || !time.test(draft.endTime) || draft.startTime === draft.endTime
      || !draft.days.length || !Number.isInteger(minutes) || minutes<1 || minutes>30
      || (!draft.scheduledEnabled && !draft.proximityEnabled)) {
      Alert.alert('설정을 확인해주세요','시간은 08:30 형식으로 입력하고, 요일과 알림 방식을 선택해주세요. 도착 기준은 1~30분입니다.');return;
    }
    setBusy(true);
    try {
      const stages = draft.notificationStages ?? [Number(threshold),3,2,1,0];
      const notificationStages = [...new Set(stages)].filter(stage => stage <= minutes);
      if (draft.scheduledEnabled && !notificationStages.length) {
        Alert.alert('알림 단계를 선택해주세요','최소 한 개의 알림 시점을 선택해주세요.');
        return;
      }
      const input = {...draft,scheduledEnabled:kind==='time',proximityEnabled:kind==='location',thresholdMinutes:minutes,notificationStages:notificationStages.length ? notificationStages : [minutes]};
      // 기존 복합 설정을 편집할 때 다른 방식의 설정을 별도 레코드로 보존한다.
      if (draft.id && draft.scheduledEnabled && draft.proximityEnabled) {
        await saveAsync({input:{...draft,scheduledEnabled:kind!=='time',proximityEnabled:kind!=='location'}});
      }
      await prepare(input);
      await saveAsync({input,id:draft.id});
      setDraft(null);
    } catch (error) { Alert.alert('알림을 저장하지 못했어요',errorMessage(error)); }
    finally { setBusy(false); }
  }, [draft, busy, threshold, prepare, saveAsync,kind]);
  const toggle = useCallback(async (alert:BusAlert, value:boolean) => {
    setBusy(true);
    try { const input={...alert,enabled:value};await prepare(input);await saveAsync({input,id:alert.id}); }
    catch(error) { Alert.alert('알림을 변경하지 못했어요',errorMessage(error)); }
    finally {setBusy(false);}
  }, [prepare, saveAsync]);
  const removeAlert = useCallback((alert:BusAlert) => {
    Alert.alert('알림을 삭제할까요?',`${alert.stop.name} · ${alert.busNumber}번`,[
      {text:'취소',style:'cancel'},
      {text:'삭제',style:'destructive',onPress:() => {void removeAsync(alert.id).catch(error => Alert.alert('삭제하지 못했어요',errorMessage(error)));}},
    ]);
  }, [removeAsync]);
  const reconnect = useCallback(async () => {
    setBusy(true);
    try {await ensureNotificationPermission();setPushWarning(await preparePush());await client.invalidateQueries({queryKey:['alerts','push-status']});}
    catch(error) {Alert.alert('알림 연결 확인',errorMessage(error));}
    finally {setBusy(false);}
  }, [client]);

  if (Platform.OS === 'web') return <SafeAreaView style={styles.page}><Text style={styles.title}>버스 알림</Text><Text style={styles.help}>예약·접근 알림은 iOS 또는 Android 앱에서 설정해주세요.</Text></SafeAreaView>;

  return <SafeAreaView style={styles.page} edges={['top','left','right']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        {draft ? <Pressable accessibilityRole="button" accessibilityLabel="알림 목록으로 돌아가기" onPress={() => setDraft(null)} style={styles.iconButton}>
          <SymbolView name={{ios:'chevron.left',android:'arrow_back',web:'arrow_back'}} size={22} tintColor={colors.accent} />
        </Pressable> : null}
        <Text accessibilityRole="header" style={styles.title}>{draft ? '알림 설정' : '버스 알림'}</Text>
        <Pressable accessibilityRole="button" onPress={() => {setMapTabHidden(false);router.navigate('/');}}><Text style={styles.link}>지도</Text></Pressable>
      </View>
      <Text style={styles.help}>원하는 시간에, 정류소 가까이에서. 버스를 놓치지 않도록 알려드려요.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/subway-alerts')}><Text style={styles.link}>지하철 알림</Text></Pressable>
      <MonitoringSessionsPanel sources={dismissedSource ? [] : sources} onDismiss={()=>setDismissedSource(true)} />
      <View style={styles.segmented}>
        {(['time','location'] as const).map(value=><Pressable key={value} disabled={busy} accessibilityRole="button" accessibilityState={{selected:kind===value}} onPress={()=>selectKind(value)} style={[styles.segment,kind===value && styles.selectedSegment]}><Text style={[styles.segmentText,kind===value && styles.selectedSegmentText]}>{value==='time' ? '시간' : '위치'}</Text></Pressable>)}
      </View>
      {runtimeError ? <View style={styles.warning}><Text style={styles.warningText}>{runtimeError}</Text><Pressable onPress={() => void Linking.openSettings()}><Text style={styles.link}>기기 설정 열기</Text></Pressable></View> : null}
      {(pushWarning || (alerts.some(a => a.enabled && a.scheduledEnabled) && pushStatus?.ready === false)) ? <View style={styles.warning}>
        <Text style={styles.warningText}>{pushWarning ?? (pushStatus?.error ? '서버의 푸시 자격 증명을 확인해주세요. 예약 알림이 중지되어 있어요.' : '예약 알림의 푸시 연결이 필요해요. 접근 알림은 별도로 동작합니다.')}</Text>
        <Pressable disabled={busy} onPress={() => void reconnect()}><Text style={styles.link}>푸시 다시 연결</Text></Pressable>
      </View> : null}

      {draft ? <>
        <View style={styles.stationCard}>
          <Text style={styles.stationName}>{draft.stop.name}</Text>
          <Text style={styles.busNumber}>{draft.busNumber}번 버스</Text>
          <Text style={styles.help}>선택한 정류소와 진행 방향으로 알림을 설정해요.</Text>
        </View>
        {kind==='time' && <View style={styles.card}>
          <Text style={styles.sectionTitle}>버스 시간 알림</Text>
          <>
            <Text style={styles.label}>반복 요일</Text>
            <View style={styles.weekdays}>{[1,2,3,4,5,6,0].map(day => <Choice key={day} label={WEEKDAYS[day]} selected={draft.days.includes(day)} value={day} onSelect={toggleDay} />)}</View>
            <Text style={styles.label}>감시 시간 · 한국 시간</Text>
            <View style={{gap:12}}>
              <AlertTimeField label="시작" value={draft.startTime} onChange={value => setDraft({...draft,startTime:value})} />
              <AlertTimeField label="종료" value={draft.endTime} onChange={value => setDraft({...draft,endTime:value})} />
            </View>
            <Text style={styles.help}>종료가 시작보다 이르면 다음 날까지 감시해요.</Text>
          </>
        </View>}
        {kind==='time' && <View style={styles.card}>
          <Text style={styles.sectionTitle}>알림 시점</Text>
          <>
            <Text style={styles.label}>버스 도착 몇 분 전에 알려드릴까요?</Text>
            <View style={styles.chips}>{[1,3,5,10].map(value => <Choice key={value} label={`${value}분 전`} selected={threshold === String(value)} value={value} onSelect={changeThreshold} />)}</View>
            <View style={styles.inline}><TextInput accessibilityLabel="직접 입력한 도착 알림 기준 분" value={threshold} onChangeText={setThreshold} keyboardType="number-pad" maxLength={2} style={styles.numberInput} placeholderTextColor={colors.tertiaryText} selectionColor={colors.accent} /><Text style={styles.help}>분 전 · 1~30분 직접 입력</Text></View>
            <Text style={styles.help}>앱을 닫아도 알려드려요. 알림 연결을 완료하면 예약한 시간에 알림을 받을 수 있어요.</Text>
            <Text style={styles.label}>단계별 알림 · 도착 예정 두 대</Text>
            <View style={styles.chips}>{[...new Set([Number(threshold),3,2,1,0])].filter(stage => Number.isInteger(stage) && stage >= 0 && stage <= Number(threshold)).map(stage =>
              <Pressable key={stage} accessibilityRole="button" accessibilityState={{selected:(draft.notificationStages ?? [Number(threshold),3,2,1,0]).includes(stage)}} onPress={() => setDraft(current => {
                if (!current) return current;
                const selected = current.notificationStages ?? [Number(threshold),3,2,1,0];
                return {...current,notificationStages:selected.includes(stage) ? selected.filter(s => s !== stage) : [...selected,stage]};
              })}><Text style={styles.link}>{(draft.notificationStages ?? [Number(threshold),3,2,1,0]).includes(stage) ? '✓ ' : ''}{stage === 0 ? '곧 도착' : `${stage}분`}</Text></Pressable>
            )}</View>
            <Text style={styles.help}>두 대를 한 알림에 표시하고 첫 번째 버스의 단계가 바뀔 때만 알려드려요. 첫 차량이 지나가면 다음 차량으로 이어져요. 곧 도착은 예상 30초 이내예요.</Text>
          </>
        </View>}
        {kind==='time' && <View style={styles.card}>
            <Toggle title="차량번호 표시" description="공급자가 제공하는 번호판 정보를 알림에 표시해요." value={draft.showVehicleNumber !== false} onChange={value => setDraft({...draft,showVehicleNumber:value})} />
        </View>}
        {kind==='location' && <View style={styles.card}>
          <Text style={styles.sectionTitle}>위치 기반 알림</Text>
          <Text style={styles.label}>접근 알림을 받을 요일</Text>
          <View style={styles.weekdays}>{[1,2,3,4,5,6,0].map(day=><Choice key={day} label={WEEKDAYS[day]} selected={draft.days.includes(day)} value={day} onSelect={toggleDay} />)}</View>
          <>
            <Text style={styles.label}>정류소까지 거리</Text>
            <View style={styles.chips}>{[100,200,300,500].map(radius => <Choice key={radius} label={`${radius}m`} selected={draft.radius===radius} value={radius} onSelect={changeRadius} />)}</View>
            <Text style={styles.help}>선택한 요일에 이 정류장에 접근하면 {draft.busNumber}번 버스의 1시간 감시를 시작할지 묻습니다. 동의하기 전에는 감시하지 않습니다.</Text>
            <Text style={styles.help}>백그라운드 감지를 위해 위치 ‘항상 허용’이 필요해요. 감지 시점은 GPS와 기기 절전 설정에 따라 달라질 수 있어요.</Text>
          </>
        </View>}
        {kind==='time' && <View style={styles.card}>
          <View style={styles.heading}><Text style={styles.sectionTitle}>현재 도착정보</Text><Pressable disabled={arrivalLoading} onPress={() => void refreshArrivals()}><Text style={styles.link}>새로고침</Text></Pressable></View>
          {arrivalError ? <Text style={styles.warningText}>도착정보를 불러오지 못했어요.</Text> : arrivalLoading && !arrivals.length ? <ActivityIndicator /> : !arrivals.length ? <Text style={styles.help}>현재 도착정보가 없습니다.</Text> : arrivalGroups.map(group => <View key={`${group.routeId}:${group.stationSeq}`} style={styles.liveRow}>
            <Text style={styles.liveNumber}>{group.busNumber}번</Text><Text style={styles.liveEta}>{formatEta(group.first.etaSeconds,group.first.serviceStatus,group.first.etaPrecision,group.first.etaSource)}</Text>
          </View>)}
        </View>}
        <AppButton title={draft.id ? '변경 사항 저장' : '알림 저장'} loading={busy} onPress={() => void submit()} />
      </> : <>
        {isPending ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : isError ? <View style={styles.card}>
          <Text style={styles.warningText}>알림 목록을 불러오지 못했어요. 서버 연결을 확인해주세요.</Text><Pressable onPress={() => void refetch()}><Text style={styles.link}>다시 시도</Text></Pressable>
        </View> : !visibleAlerts.length ? <View style={styles.empty}>
          <SymbolView name={{ios:'bell',android:'notifications',web:'notifications'}} size={42} tintColor={colors.accent} />
          <Text style={styles.stationName}>아직 설정한 알림이 없어요</Text><Text style={styles.help}>지도에서 정류소를 고르고 버스 시간 오른쪽의 종 버튼을 눌러주세요.</Text>
          <Pressable onPress={() => {setMapTabHidden(false);router.navigate('/');}}><Text style={styles.link}>지도에서 버스 선택하기</Text></Pressable>
        </View> : visibleAlerts.map(alert => <View key={alert.id} style={[styles.card,!alert.enabled && styles.dim]}>
          <View style={styles.heading}><View style={styles.flex}><Text style={styles.stationName}>{alert.stop.name}</Text><Text style={styles.busNumber}>{alert.busNumber}번 버스</Text></View><Switch accessibilityLabel={`${alert.busNumber}번 알림 사용`} disabled={busy || save.isPending || remove.isPending} value={alert.enabled} onValueChange={value => void toggle(alert,value)} trackColor={{true:colors.success}} /></View>
          {kind==='time' ? <><Text style={styles.detail}>{alert.days.map(day => WEEKDAYS[day]).join(' · ')}  {alert.startTime}–{alert.endTime}</Text><Text style={styles.detail}>도착 {alert.thresholdMinutes}분 전 · {pushStatus?.ready ? '예약 감시' : '푸시 연결 필요'}</Text></> : <Text style={styles.detail}>{alert.days.map(day=>WEEKDAYS[day]).join(' · ')} · 정류소 {alert.radius}m 접근 시 감시 시작 확인</Text>}
          <View style={styles.actions}><Pressable accessibilityRole="button" disabled={busy} onPress={() => {setDraft(alert);setThreshold(String(alert.thresholdMinutes));}}><Text style={styles.link}>수정</Text></Pressable><Pressable accessibilityRole="button" disabled={remove.isPending || busy} onPress={() => removeAlert(alert)}><Text style={styles.deleteText}>삭제</Text></Pressable></View>
        </View>)}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

function errorMessage(error:unknown) {
  const response = error as {response?:{data?:{message?:unknown}}};
  const message = response.response?.data?.message;
  return typeof message === 'string' ? message : error instanceof Error ? error.message : '네트워크와 권한 설정을 확인해주세요.';
}
const Toggle = memo(function Toggle({title,description,value,onChange}:{title:string;description:string;value:boolean;onChange:(value:boolean)=>void}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return <View style={styles.heading}><View style={styles.flex}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.help}>{description}</Text></View><Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{true:colors.success}} /></View>;
});
const Choice = memo(function Choice({label,selected,value,onSelect}:{label:string;selected:boolean;value:number;onSelect:(value:number)=>void}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const onPress = useCallback(() => onSelect(value), [onSelect, value]);
  return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={[styles.chip,selected && styles.selectedChip]}><Text style={[styles.chipText,selected && styles.selectedChipText]}>{label}</Text></Pressable>;
});
const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background}, content:{padding:20,paddingBottom:120,gap:20},
  heading:{flexDirection:'row',alignItems:'center',gap:12},flex:{flex:1},title:{flex:1,fontSize:34,fontWeight:'700',color:colors.text},
  help:{color:colors.secondaryText,fontSize:15,lineHeight:22},link:{color:colors.accent,fontSize:17,fontWeight:'500',minHeight:44,minWidth:44,paddingVertical:11},
  card:{backgroundColor:colors.surface,borderRadius:16,padding:18,gap:14},stationCard:{backgroundColor:colors.accentSurface,borderRadius:16,padding:20,gap:8},
  stationName:{color:colors.text,fontSize:19,fontWeight:'700'},busNumber:{color:colors.accent,fontSize:22,fontWeight:'700',marginTop:5},
  sectionTitle:{fontSize:16,fontWeight:'700',color:colors.text},label:{fontSize:14,fontWeight:'600',color:colors.text,marginTop:6},
  segmented:{flexDirection:'row',padding:3,borderRadius:12,backgroundColor:colors.secondarySurface},segment:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:9},selectedSegment:{backgroundColor:colors.surface},segmentText:{fontSize:15,fontWeight:'600',color:colors.secondaryText},selectedSegmentText:{color:colors.text},weekdays:{flexDirection:'row',flexWrap:'wrap',gap:4},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{minWidth:44,minHeight:44,borderRadius:12,backgroundColor:colors.secondarySurface,paddingHorizontal:10,alignItems:'center',justifyContent:'center'},
  selectedChip:{backgroundColor:colors.accent},chipText:{color:colors.secondaryText,fontSize:14,fontWeight:'600'},selectedChipText:{color:colors.onAccent},
  inline:{flexDirection:'row',alignItems:'center',gap:10},numberInput:{minWidth:65,padding:12,borderRadius:10,backgroundColor:colors.background,fontSize:18,color:colors.text},
  iconButton:{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center'},dim:{opacity:0.55},detail:{fontSize:14,color:colors.secondaryText,lineHeight:21},
  actions:{flexDirection:'row',gap:24,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.separator,paddingTop:6},deleteText:{color:colors.danger,minHeight:44,paddingVertical:11,fontSize:17},
  empty:{paddingVertical:60,gap:18,alignItems:'center'},loading:{paddingVertical:60},warning:{backgroundColor:colors.warningSurface,padding:16,borderRadius:16,gap:8},warningText:{color:colors.warning,fontSize:15,lineHeight:22},
  liveRow:{flexDirection:'row',justifyContent:'space-between',gap:10},liveNumber:{color:colors.text,fontSize:14,fontWeight:'600'},liveEta:{color:colors.accent,fontSize:14,flexShrink:1,textAlign:'right'},
});
