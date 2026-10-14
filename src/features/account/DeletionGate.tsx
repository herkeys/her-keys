import {useEffect,useSyncExternalStore,type ReactNode} from 'react';
import {AppState,Linking,View} from 'react-native';
import {SplashScreen} from 'expo-router';
import {AppText,Button,Screen} from '../../design/components';
import {deletionRuntime} from '../../store/deletionRuntimeInstance';
import {accountRuntime} from '../../store/accountRuntimeInstance';
import {useStoreSnapshot} from '../../store/AppStateProvider';

export function DeletionGate({children}:{children:ReactNode}) {
 const snapshot=useStoreSnapshot();
 const gate=useSyncExternalStore(deletionRuntime.subscribe,deletionRuntime.getSnapshot,deletionRuntime.getSnapshot);
 const hydrated=snapshot.state!==null;
 useEffect(()=>{if(hydrated && gate.kind!=='checking')SplashScreen.hide();},[hydrated,gate.kind]);
 useEffect(()=>{
  if(!hydrated)return;
  void deletionRuntime.check();
  const interval=setInterval(()=>{void deletionRuntime.check();},60000);
  const foreground=AppState.addEventListener('change',state=>{
   deletionRuntime.restrict();
   if(state==='active')void deletionRuntime.check();
  });
  const stop=accountRuntime.subscribe(()=>{void deletionRuntime.check();});
  return()=>{clearInterval(interval);foreground.remove();stop();};
 },[hydrated]);
 if(!hydrated || gate.kind==='active')return children;
 const title=gate.kind==='review'?'Deletion requires privacy review':gate.kind==='pending'?'Account deletion pending':gate.kind==='purged'?'Account permanently deleted':
  gate.kind==='restored'?'Account restored':gate.kind==='checking'?'Checking account access':'Account status unavailable';
 return <Screen><View style={{padding:24,gap:20}}>
  <AppText variant="hero" accessibilityRole="header">{title}</AppText>
  <AppText>{gate.kind==='review'?'Some resources require manual privacy review. Account access remains restricted. Contact support for the resolution status; permanent deletion is not yet complete.':gate.kind==='pending'?'Normal app access and sync are stopped. Use your recovery email to restore your account within 30 days.':
   gate.kind==='purged'?'The server has verified permanent deletion.':
   gate.kind==='restored'?'Sign in again to use your restored account.':
   'Connect to the internet and retry. An unavailable status does not mean your data has been deleted.'}</AppText>
  {gate.deadline?<AppText>Recovery deadline: {new Date(gate.deadline).toLocaleString()}</AppText>:null}
  <Button label="Check status" onPress={()=>void deletionRuntime.check()}/>
  <Button label="Recovery and support" variant="secondary" onPress={()=>void Linking.openURL('https://herkeys.app/account/restore')}/>
  {gate.kind==='purged'||gate.kind==='restored'?<Button label="Continue to sign in" onPress={()=>deletionRuntime.continueToSignIn()}/>:null}
 </View></Screen>;
}
