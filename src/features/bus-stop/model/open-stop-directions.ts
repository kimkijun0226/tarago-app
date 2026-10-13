import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';
import type { BusStop } from '../api/get-nearby-bus-stops';

/** 네이버의 공식 URL Scheme으로 현재 위치에서 선택 정류장까지 길찾기를 연다. */
export async function openStopDirections(stop:BusStop,mode:'walk'|'public') {
  const query=`dlat=${stop.latitude}&dlng=${stop.longitude}&dname=${encodeURIComponent(stop.name)}&appname=com.anonymous.tarago`;
  try {await Linking.openURL(`nmap://route/${mode}?${query}`);}
  catch {
    Alert.alert('네이버지도 설치가 필요해요','길찾기는 네이버지도 앱에서 안내합니다.',[
      {text:'취소',style:'cancel'},
      {text:'설치',onPress:()=>{void Linking.openURL(Platform.OS==='ios'
        ? 'https://apps.apple.com/app/id311867728'
        : 'https://play.google.com/store/apps/details?id=com.nhn.android.nmap')
        .catch(()=>Alert.alert('스토어를 열지 못했어요','네이버지도를 직접 설치해주세요.'));}},
    ]);
  }
}
