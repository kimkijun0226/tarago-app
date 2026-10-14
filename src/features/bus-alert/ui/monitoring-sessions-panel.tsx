import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { AppButton, AppSection, useAppTheme } from '@/shared/ui/design-system';
import type { BusAlert } from '../model/bus-alert';
import { useMonitoringSessions } from '../model/use-monitoring-sessions';

/** 반복 예약과 분리된 임시 감시 카드를 표시하고 시작·연장·중지를 처리한다. */
export function MonitoringSessionsPanel({sources,onDismiss}:{sources:BusAlert[];onDismiss:()=>void}) {
  const { colors } = useAppTheme();
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

    {sources.length>0 && <AppSection title="정류소 접근 알림">
      <Text style={{fontSize:17,fontWeight:'600',color:colors.text}}>{sources[0].stop.name} 정류소 근처입니다</Text>
      <Text style={{fontSize:15,lineHeight:22,color:colors.secondaryText}}>{sources.map(source=>`${source.busNumber}번`).join(', ')} 버스 실시간 도착 알림을 지금부터 1시간 동안 시작할까요?</Text>
      <AppButton disabled={busy} title="1시간 실시간 알림 시작" onPress={()=>void run(async()=>{for(const source of sources)await begin(source);})} />
      <AppButton disabled={busy} variant="secondary" title="지금은 안 할게요" onPress={onDismiss} />
    </AppSection>}
    {sessions.map(session=>{
      const left = Math.max(0,Math.ceil((Date.parse(session.monitoringEndsAt!)-now)/60_000));
      return <AppSection key={session.id} title="임시 버스 감시">
        <Text style={{fontSize:17,fontWeight:'600',color:colors.text}}>{session.busNumber}번 · {session.stop.name}</Text>
        <Text style={{color:colors.success,fontSize:15,lineHeight:22}}>{left ? `${left}분 남음 · 임시 감시 중` : '감시 종료 · 연장 응답 대기'}</Text>
        <AppButton disabled={busy} variant="secondary" title="지금부터 1시간 연장" onPress={()=>void run(()=>extend(session))} />
        <AppButton disabled={busy} variant="destructive" title="감시 끄기" onPress={()=>void run(()=>stop(session))} />
      </AppSection>;
    })}
    {busy && <ActivityIndicator color={colors.accent} />}
  </View>;
}
