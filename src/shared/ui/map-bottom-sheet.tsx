import { useAppTheme } from '@/shared/ui/design-system';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
export type MapSheetSnap = 'compact' | 'half' | 'full';

const SNAPS:MapSheetSnap[]=['compact','half','full'];

/** 지도 시트의 제스처는 UI 스레드에서 처리하고 정착할 때만 지도 여백을 갱신한다. */
export function MapBottomSheet({children,snap,onChangeSnap,onHeightChange,edgeToEdge=false}:{
  children:ReactNode;snap?:MapSheetSnap;onChangeSnap?:(snap:MapSheetSnap)=>void;
  onHeightChange:(height:number)=>void;
  edgeToEdge?:boolean;
}) {
  const { colors, radius } = useAppTheme();
  const ref=useRef<BottomSheet>(null);
  const {height}=useWindowDimensions();
  const insets=useSafeAreaInsets();
  const points=useMemo(()=>[150,height*(edgeToEdge ? .5 : .47),height-insets.top-(edgeToEdge ? 0 : insets.bottom+32)],[height,insets.top,insets.bottom,edgeToEdge]);
  const index=useRef(snap ? SNAPS.indexOf(snap) : 1);
  const handle=useCallback(()=> edgeToEdge && snap === 'full' ? <View /> : <View style={{alignItems:'center',paddingVertical:12}}>
    <View style={{width:44,height:4,borderRadius:2,backgroundColor:colors.tertiaryText}} />
  </View>,[colors.tertiaryText,edgeToEdge,snap]);
  const change=useCallback((next:number)=>{
    if(next<0){ref.current?.snapToIndex(index.current);return;}
    index.current=next;onHeightChange(points[next]);onChangeSnap?.(SNAPS[next]);
  },[onHeightChange,onChangeSnap,points]);
  useEffect(()=>{onHeightChange(points[index.current]);},[onHeightChange,points]);
  useEffect(()=>{
    if(snap && SNAPS.indexOf(snap)!==index.current) ref.current?.snapToIndex(SNAPS.indexOf(snap));
  },[snap]);
  return <BottomSheet ref={ref} index={snap ? SNAPS.indexOf(snap) : 1} snapPoints={points} enableDynamicSizing={false}
    enablePanDownToClose={false} bottomInset={edgeToEdge ? 0 : insets.bottom+8} topInset={insets.top+(edgeToEdge ? 0 : 12)} detached={!edgeToEdge}
    style={{marginHorizontal:edgeToEdge ? 0 : 12}} backgroundStyle={{borderRadius:radius.sheet,backgroundColor:colors.surface}}
    handleComponent={handle} onChange={change}>
    {children}
  </BottomSheet>;
}
