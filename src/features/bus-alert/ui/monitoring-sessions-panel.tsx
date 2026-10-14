import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import type { BusAlert } from '../model/bus-alert';
import { useMonitoringSessions } from '../model/use-monitoring-sessions';

/** 반복 예약과 분리된 임시 감시 카드를 표시하고 시작·연장·중지를 처리한다. */
export function MonitoringSessionsPanel({sources,onDismiss}:{sources:BusAlert[];onDismiss:()=>void}) {
  const {sessions,begin,extend,stop} = useMonitoringSessions();
  const [now,setNow] = useState(()=>Date.now());
  const [busy,setBusy] = useState(false);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return ()=>clearInterval(timer);},[]);
  async function run(action:()=>Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {await action();setNow(Date.now());onDismiss();}
    catch (e) {Alert.alert('임시 감시 설정',e instanceof Error ? e.message : '서버 연결을 확인해주세요.');}
    finally {setBusy(false);}
  }
  if (!sources.length && !sessions.length) return null;
  return <View style={{gap:12}}>
    <Text style={{fontSize:18,fontWeight:'700'}}>임시 버스 감시</Text>
    {sources.length>0 && <View style={{backgroundColor:'#EAF2FF',borderRadius:18,padding:18,gap:12}}>
      <Text style={{fontSize:17,fontWeight:'700'}}>{sources[0].stop.name} 정류소 근처입니다</Text>
      <Text>{sources.map(source=>`${source.busNumber}번`).join(', ')} 버스 실시간 도착 알림을 지금부터 1시간 동안 시작할까요?</Text>
      <Pressable disabled={busy} onPress={()=>void run(async()=>{for(const source of sources)await begin(source);})}><Text style={{color:'#1769E0',padding:8}}>실시간 알림 시작 (1시간)</Text></Pressable>
      <Pressable disabled={busy} onPress={onDismiss}><Text>지금은 안 할게요</Text></Pressable>
    </View>}
    {sessions.map(session=>{
      const left = Math.max(0,Math.ceil((Date.parse(session.monitoringEndsAt!)-now)/60_000));
      return <View key={session.id} style={{backgroundColor:'#FFF3DE',borderRadius:18,padding:18,gap:10}}>
        <Text style={{fontSize:17,fontWeight:'700'}}>{session.busNumber}번 · {session.stop.name}</Text>
        <Text>{left ? `${left}분 남음 · 임시 감시 중` : '감시 종료 · 연장 응답 대기'}</Text>
        <View style={{flexDirection:'row',gap:24}}>
          <Pressable disabled={busy} onPress={()=>void run(()=>extend(session))}><Text style={{color:'#1769E0',padding:8}}>지금부터 1시간 연장</Text></Pressable>
          <Pressable disabled={busy} onPress={()=>void run(()=>stop(session))}><Text style={{color:'#D44343',padding:8}}>끄기</Text></Pressable>
        </View>
      </View>;
    })}
    {busy && <ActivityIndicator />}
  </View>;
}
