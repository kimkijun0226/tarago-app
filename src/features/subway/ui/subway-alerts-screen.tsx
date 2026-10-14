import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AppButton, useAppTheme } from '@/shared/ui/design-system';
import { AlertTimeField } from '@/features/bus-alert/ui/alert-time-field';
import { ensureNotificationPermission, preparePush } from '@/features/bus-alert/model/alert-runtime';
import { usePushStatus } from '@/features/bus-alert/model/use-alerts';
import { useMapTabVisibility } from '@/components/map-tab-visibility';
import { useSubwayAlerts, useSubwayAlertMutations } from '../model/use-subway-alerts';
import { useSubwayArrivals } from '../model/use-subway-arrivals';
import type { SubwayAlert, SubwayAlertInput } from '../model/subway-alert';

type Draft = SubwayAlertInput & { id?: string };
const DAYS = ['일','월','화','수','목','금','토'];
function message(error: unknown) {
  return isAxiosError(error) && typeof error.response?.data?.message === 'string' ? error.response.data.message
    : error instanceof Error ? error.message : '네트워크와 알림 권한을 확인해주세요.';
}
/** 실제 도착정보에서 선택한 노선·방향만 예약하며 서버가 앱 종료 후에도 감시한다. */
export default function SubwayAlertsScreen() {
  const params = useLocalSearchParams<{ stationName?: string; lineId?: string; lineName?: string; direction?: string; requestId?: string; alertId?: string }>();
  const alerts = useSubwayAlerts();
  const saved = alerts.data?.find(a => a.id === params.alertId);
  const [openedAt] = useState(Date.now);
  const startTime = new Date(openedAt + 9 * 3600_000).toISOString().slice(11,16);
  const endTime = new Date(openedAt + 10 * 3600_000).toISOString().slice(11,16);
  const initial: Draft | null = saved ?? (params.requestId && params.stationName && params.lineId && params.direction ? {
    stationName:params.stationName,lineId:params.lineId,lineName:params.lineName,direction:params.direction,
    days:[1,2,3,4,5],startTime,endTime,thresholdMinutes:5,notificationStages:[5,3,2,1,0],enabled:true,
  } : null);
  return <SubwayAlertsContent key={`${params.requestId ?? ''}:${params.alertId ?? ''}:${Boolean(saved)}`} initial={initial} />;
}

function SubwayAlertsContent({ initial }: { initial: Draft | null }) {
  const { colors, type } = useAppTheme();
  const { setMapTabHidden } = useMapTabVisibility();
  const client = useQueryClient();
  const list = useSubwayAlerts();
  const { save, remove } = useSubwayAlertMutations();
  const { data: pushStatus } = usePushStatus();
  const [draft,setDraft] = useState<Draft | null>(initial);
  const [threshold,setThreshold] = useState(String(initial?.thresholdMinutes ?? 5));
  const [busy,setBusy] = useState(false);
  const [warning,setWarning] = useState<string | null>(null);
  const live = useSubwayArrivals(draft?.stationName ?? '');
  const card = { backgroundColor:colors.surface,borderRadius:16,padding:18,gap:14 } as const;
  const help = { ...type.footnote,color:colors.secondaryText };
  const link = { color:colors.accent,fontSize:17,paddingVertical:12,minHeight:44 } as const;
  const map = () => { setMapTabHidden(false);router.navigate('/'); };
  const prepare = async () => {
    await ensureNotificationPermission();
    setWarning(await preparePush());
    await client.invalidateQueries({queryKey:['alerts','push-status']});
  };
  const persist = async (input: Draft) => {
    if (busy) return;
    setBusy(true);
    try { if (input.enabled) await prepare();await save.mutateAsync({input,id:input.id});setDraft(null); }
    catch (error) { Alert.alert('알림을 저장하지 못했어요',message(error)); }
    finally { setBusy(false); }
  };
  const submit = () => {
    if (!draft) return;
    const minutes = Number(threshold);
    const stages = (draft.notificationStages ?? [minutes,3,2,1,0]).filter(s => s <= minutes);
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(draft.startTime) || !time.test(draft.endTime) || !draft.days.length || !Number.isInteger(minutes) || minutes < 1 || minutes > 30 || !stages.length || draft.startTime === draft.endTime) {
      Alert.alert('설정을 확인해주세요','반복 요일, 서로 다른 시작·종료 시간과 알림 단계를 선택해주세요. 도착 기준은 1~30분입니다.');return;
    }
    void persist({...draft,thresholdMinutes:minutes,notificationStages:stages});
  };
  const deleteAlert = (alert: SubwayAlert) => Alert.alert('알림을 삭제할까요?',`${alert.stationName} · ${alert.direction}`, [
    {text:'취소',style:'cancel'},{text:'삭제',style:'destructive',onPress:() => void remove.mutateAsync(alert.id).catch(error => Alert.alert('삭제하지 못했어요',message(error)))},
  ]);
  const choice = (label:string,selected:boolean,onPress:()=>void,key:string|number) => <Pressable key={key} accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} disabled={busy}
    style={{minHeight:44,minWidth:44,padding:12,borderRadius:12,backgroundColor:selected ? colors.accent : colors.secondarySurface}}><Text style={{color:selected ? colors.onAccent : colors.text}}>{label}</Text></Pressable>;
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}} edges={['top','left','right']}>
    <ScrollView contentContainerStyle={{padding:20,paddingBottom:120,gap:20}} keyboardShouldPersistTaps="handled">
      <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
        {draft ? <Pressable disabled={busy} onPress={() => setDraft(null)} accessibilityRole="button"><Text style={link}>목록</Text></Pressable> : null}
        <Text accessibilityRole="header" style={{...type.title,color:colors.text,flex:1}}>지하철 알림</Text>
        <Pressable onPress={map} accessibilityRole="button"><Text style={link}>지도</Text></Pressable>
      </View>
      <Text style={help}>선택한 역·노선·방향의 열차를 원하는 요일과 시간에 알려드려요.</Text>
      {Platform.OS === 'web' ? <Text style={help}>예약 알림은 iOS 또는 Android 앱에서 설정해주세요.</Text> : <>
        {(warning || (list.data?.some(a => a.enabled) && pushStatus?.ready === false)) ? <View style={{...card,backgroundColor:colors.warningSurface}}>
          <Text style={{color:colors.warning}}>{warning ?? '예약 알림의 푸시 연결이 필요해요. 연결 전에는 알림을 받을 수 없어요.'}</Text>
          <Pressable disabled={busy} onPress={() => {setBusy(true);void prepare().catch(error => Alert.alert('알림 연결 확인',message(error))).finally(() => setBusy(false));}}><Text style={link}>푸시 다시 연결</Text></Pressable>
          <Pressable onPress={() => void Linking.openSettings()}><Text style={link}>기기 설정 열기</Text></Pressable>
        </View> : null}
        {draft ? <>
          <View style={{...card,backgroundColor:colors.accentSurface}}><Text style={{...type.headline,color:colors.text}}>{draft.stationName}</Text><Text style={{...type.headline,color:colors.accent}}>{draft.lineName ?? draft.lineId} · {draft.direction}</Text><Text style={help}>같은 방향의 도착 예정 열차를 감시해요.</Text></View>
          <View style={card}><Text style={{...type.headline,color:colors.text}}>반복 요일</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{[1,2,3,4,5,6,0].map(day => choice(DAYS[day],draft.days.includes(day),() => setDraft({...draft,days:draft.days.includes(day) ? draft.days.filter(d => d !== day) : [...draft.days,day].sort()}),day))}</View>
            <Text style={help}>감시 시간 · 한국 시간</Text><AlertTimeField label="시작" value={draft.startTime} onChange={startTime => setDraft({...draft,startTime})}/><AlertTimeField label="종료" value={draft.endTime} onChange={endTime => setDraft({...draft,endTime})}/><Text style={help}>종료가 시작보다 이르면 다음 날까지 감시해요.</Text>
          </View>
          <View style={card}><Text style={{...type.headline,color:colors.text}}>알림 시점</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[1,3,5,10].map(value => choice(`${value}분 전`,threshold===String(value),() => {setThreshold(String(value));setDraft({...draft,notificationStages:[...new Set([value,3,2,1,0])].filter(s => s<=value)});},value))}</View>
            <View style={{flexDirection:'row',alignItems:'center',gap:12}}><TextInput accessibilityLabel="도착 알림 기준 분" value={threshold} onChangeText={setThreshold} keyboardType="number-pad" maxLength={2} style={{color:colors.text,backgroundColor:colors.secondarySurface,borderRadius:12,padding:12,minWidth:64,fontSize:18}}/><Text style={help}>분 전 · 1~30분</Text></View>
            <Text style={help}>단계별 알림</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[...new Set([Number(threshold),3,2,1,0])].filter(s => Number.isInteger(s) && s>=0 && s<=Number(threshold)).map(stage => choice(stage===0 ? '곧 도착' : `${stage}분`,(draft.notificationStages ?? [5,3,2,1,0]).includes(stage),() => {const stages=draft.notificationStages ?? [5,3,2,1,0];setDraft({...draft,notificationStages:stages.includes(stage) ? stages.filter(s => s!==stage) : [...stages,stage]});},stage))}</View>
            <Text style={help}>앱을 닫아도 예약 시간에 알려드려요. 앞 열차가 지나가면 다음 열차로 이어져요.</Text>
          </View>
          <View style={card}><Text style={{...type.headline,color:colors.text}}>현재 도착정보 · 15초마다 갱신</Text>{live.isPending ? <ActivityIndicator color={colors.accent}/> : live.isError ? <><Text style={{color:colors.warning}}>도착정보를 불러오지 못했어요.</Text><Pressable onPress={() => void live.refetch()}><Text style={link}>다시 조회</Text></Pressable></> : live.data?.arrivals.filter(a => a.lineId===draft.lineId && a.direction===draft.direction).slice(0,2).map(a => <Text key={a.id} style={help}>{a.destination}행 · {a.arrivalMessage || '시간 확인 중'}</Text>)}{live.data && !live.data.arrivals.some(a => a.lineId===draft.lineId && a.direction===draft.direction) ? <Text style={help}>현재 이 방향의 도착정보가 없습니다.</Text> : null}</View>
          <AppButton title={draft.id ? '변경 사항 저장' : '알림 저장'} loading={busy} onPress={submit}/>
        </> : list.isPending ? <ActivityIndicator color={colors.accent}/> : list.isError ? <View style={card}><Text style={{color:colors.warning}}>알림 목록을 불러오지 못했어요.</Text><Pressable onPress={() => void list.refetch()}><Text style={link}>다시 시도</Text></Pressable></View> : <>
          {!list.data?.length ? <View style={card}><Text style={{...type.headline,color:colors.text}}>아직 설정한 알림이 없어요</Text><Text style={help}>지도에서 지하철역을 고르고 도착정보의 알림 설정을 눌러주세요.</Text><Pressable onPress={map}><Text style={link}>지도에서 역 선택하기</Text></Pressable></View> : list.data.map(alert => <View key={alert.id} style={card}>
            <View style={{flexDirection:'row',alignItems:'center',gap:12}}><View style={{flex:1}}><Text style={{...type.headline,color:colors.text}}>{alert.stationName}</Text><Text style={help}>{alert.lineName ?? alert.lineId} · {alert.direction}</Text></View><Switch accessibilityLabel={`${alert.stationName} ${alert.direction} 알림 사용`} value={alert.enabled} disabled={busy || save.isPending || remove.isPending} onValueChange={enabled => void persist({...alert,enabled})} trackColor={{true:colors.success}}/></View>
            <Text style={help}>{alert.days.map(day => DAYS[day]).join(' · ')}  {alert.startTime}–{alert.endTime}</Text><Text style={help}>도착 {alert.thresholdMinutes}분 전 · {pushStatus?.ready ? '예약 감시' : '푸시 연결 필요'}</Text>
            <View style={{flexDirection:'row',gap:24}}><Pressable disabled={busy} onPress={() => {setDraft(alert);setThreshold(String(alert.thresholdMinutes));}}><Text style={link}>수정</Text></Pressable><Pressable disabled={busy || remove.isPending} onPress={() => deleteAlert(alert)}><Text style={{...link,color:colors.danger}}>삭제</Text></Pressable></View>
          </View>)}
        </>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
