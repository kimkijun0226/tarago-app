import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/shared/ui/design-system';

/** 한국 시간 예약을 iOS 휠 또는 Android 시계 선택기로 편집한다. */
export function AlertTimeField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  const { colors } = useAppTheme();
  const [expanded,setExpanded] = useState(false);
  const [hours,minutes] = value.split(':').map(Number);
  const date = Platform.OS === 'ios'
    ? new Date(`2000-01-01T${value}:00+09:00`)
    : new Date(2000,0,1,hours,minutes);
  return <View style={{flex:1}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} 시간 선택, ${value}`} accessibilityState={{expanded}} style={{minHeight:52,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12}} onPress={() => setExpanded(!expanded)}>
      <Text style={{color:colors.text,fontSize:17}}>{label}</Text>
      <Text style={{fontSize:20,color:colors.accent,paddingVertical:10,fontVariant:["tabular-nums"]}}>{value}</Text>
    </Pressable>
    {expanded && <DateTimePicker value={date} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      presentation={Platform.OS === 'android' ? 'dialog' : 'inline'} locale="ko_KR" timeZoneName="Asia/Seoul" is24Hour
      onDismiss={() => setExpanded(false)} onValueChange={(_,selected) => {
        const time = Platform.OS === 'ios'
          ? new Date(selected.getTime()+9*60*60_000).toISOString().slice(11,16)
          : `${String(selected.getHours()).padStart(2,'0')}:${String(selected.getMinutes()).padStart(2,'0')}`;
        onChange(time);
        if (Platform.OS === 'android') setExpanded(false);
      }} />}
  </View>;
}
