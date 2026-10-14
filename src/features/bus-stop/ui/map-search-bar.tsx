import { mapTheme } from '@/shared/ui/map-theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { searchBusStops } from '../api/search-bus-stops';
import type { BusStop } from '../api/get-nearby-bus-stops';
import type { Coordinate } from '@/hooks/use-current-location';

/** 검색과 목적지 선택은 지도 조작 상태와 분리하고 입력이 멈춘 뒤 조회한다. */
export function MapSearchBar({position,top,left=16,onSelect}:{position:Coordinate;top:number;left?:number;onSelect:(stop:BusStop)=>void}) {
  const [text,setText]=useState('');
  const [query,setQuery]=useState('');
  const [focused,setFocused]=useState(false);
  const [destination,setDestination]=useState<BusStop|null>(null);
  useEffect(()=>{const timer=setTimeout(()=>setQuery(text.trim()),300);return ()=>clearTimeout(timer);},[text]);
  const {data=[],isFetching,isError}=useQuery({
    queryKey:['bus-stops','search',query,position.latitude,position.longitude],
    queryFn:({signal})=>searchBusStops(query,position,signal),
    enabled:focused && query.length>=2,staleTime:60_000,retry:1,
  });
  return <View style={{position:'absolute',top,left,right:16,gap:8}}>
    <View style={{flexDirection:'row',alignItems:'center',backgroundColor:mapTheme.colors.surface,borderRadius:mapTheme.radius.search,paddingHorizontal:16,minHeight:52,shadowOpacity:.12,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:5}}>
      <Text style={{fontSize:22,color:mapTheme.colors.primary,marginRight:8}}>⌕</Text>
      <TextInput value={text} onChangeText={value=>{setText(value);setDestination(null);}}
        onFocus={()=>setFocused(true)} placeholder="정류장 이름·번호 검색" accessibilityLabel="정류장 검색"
        returnKeyType="search" onSubmitEditing={()=>setQuery(text.trim())} style={{flex:1,paddingVertical:12,fontSize:16}} />
      {text ? <Pressable accessibilityLabel="검색 닫기" onPress={()=>{setText('');setDestination(null);setFocused(false);Keyboard.dismiss();}}><Text style={{padding:8,fontSize:22}}>×</Text></Pressable> : null}
    </View>
    {focused && text.length>0 && !destination ? <View style={{backgroundColor:mapTheme.colors.surface,borderRadius:mapTheme.radius.results,maxHeight:320,padding:8}}>
      {isFetching ? <ActivityIndicator style={{padding:12}} /> : null}
      {query.length<2 ? <Text style={{padding:12}}>두 글자 이상 입력해주세요.</Text> : isError ? <Text style={{padding:12}}>검색하지 못했어요. 서버 연결을 확인해주세요.</Text> : !isFetching && !data.length ? <Text style={{padding:12}}>일치하는 정류장이 없습니다.</Text> : null}
      <FlatList data={data} keyboardShouldPersistTaps="handled" keyExtractor={item=>item.id}
        renderItem={({item})=><Pressable onPress={()=>{setDestination(item);setText(item.name);setFocused(false);Keyboard.dismiss();onSelect(item);}} style={{padding:12,borderBottomWidth:.5,borderColor:mapTheme.colors.divider}}>
          <Text style={{fontWeight:'600',fontSize:16}}>{item.name}</Text>
          <Text style={{color:mapTheme.colors.muted,marginTop:4}}>{item.arsId??'번호 없음'} · {Math.round(item.distanceMeters)}m</Text>
        </Pressable>} />
    </View> : null}
  </View>;
}
