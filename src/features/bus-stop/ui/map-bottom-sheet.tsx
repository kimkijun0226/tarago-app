import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RouteSheetSnap } from '../model/bus-route-presentation';

const SNAPS:RouteSheetSnap[]=['compact','half','full'];

/** 지도 시트의 제스처는 UI 스레드에서 처리하고 정착할 때만 지도 여백을 갱신한다. */
export function MapBottomSheet({children,snap,onChangeSnap,onHeightChange}:{
  children:ReactNode;snap?:RouteSheetSnap;onChangeSnap?:(snap:RouteSheetSnap)=>void;
  onHeightChange:(height:number)=>void;
}) {
  const ref=useRef<BottomSheet>(null);
  const {height}=useWindowDimensions();
  const insets=useSafeAreaInsets();
  const points=useMemo(()=>[150,height*.47,height-insets.top-insets.bottom-32],[height,insets.top,insets.bottom]);
  const index=useRef(snap ? SNAPS.indexOf(snap) : 1);
  const handle=useCallback(()=> <View style={{alignItems:'center',paddingTop:10}}>
    <View style={{width:44,height:4,borderRadius:2,backgroundColor:'#AEB4BC'}} />
    <View style={{flexDirection:'row',gap:24}}>
      {['작게','중간','크게'].map((label,next)=><Pressable key={label} accessibilityRole="button"
        accessibilityLabel={`시트 ${label}`} onPress={()=>ref.current?.snapToIndex(next)}>
        <Text style={{paddingVertical:8,paddingHorizontal:8,color:'#69717C',fontSize:12}}>{label}</Text>
      </Pressable>)}
    </View>
  </View>,[]);
  const change=useCallback((next:number)=>{
    if(next<0){ref.current?.snapToIndex(index.current);return;}
    index.current=next;onHeightChange(points[next]);onChangeSnap?.(SNAPS[next]);
  },[onHeightChange,onChangeSnap,points]);
  useEffect(()=>{onHeightChange(points[index.current]);},[onHeightChange,points]);
  useEffect(()=>{
    if(snap && SNAPS.indexOf(snap)!==index.current) ref.current?.snapToIndex(SNAPS.indexOf(snap));
  },[snap]);
  return <BottomSheet ref={ref} index={snap ? SNAPS.indexOf(snap) : 1} snapPoints={points} enableDynamicSizing={false}
    enablePanDownToClose={false} bottomInset={insets.bottom+8} topInset={insets.top+12} detached
    style={{marginHorizontal:12}} backgroundStyle={{borderRadius:24,backgroundColor:'#FFFFFF'}}
    handleComponent={handle} onChange={change}>
    {children}
  </BottomSheet>;
}
