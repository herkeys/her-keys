import {useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {AppState,Linking,StyleSheet,TextInput,View} from 'react-native';
import {SplashScreen} from 'expo-router';
import {AppText,Button,Screen} from '../../design/components';
import {deletionRuntime} from '../../store/deletionRuntimeInstance';
import {accountRuntime} from '../../store/accountRuntimeInstance';
import {useStoreSnapshot} from '../../store/AppStateProvider';

export function DeletionGate({children}:{children:ReactNode}) {
 const [receipt,setReceipt]=useState(''),[receiptNotice,setReceiptNotice]=useState(''),[importing,setImporting]=useState(false);
 const [resetAccount,setResetAccount]=useState<string|null>(null),[resetConfirmation,setResetConfirmation]=useState('');
 const snapshot=useStoreSnapshot();
 const gate=useSyncExternalStore(deletionRuntime.subscribe,deletionRuntime.getSnapshot,deletionRuntime.getSnapshot);
 const hydrated=snapshot.state!==null;
 const recoveryExpired=!!gate.deadline&&Date.parse(gate.deadline)<=Date.now();
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
 // restrict() publishes 'checking' on EVERY AppState change. That re-check must COVER the app, never unmount it: unmounting the
 // account tree discarded an in-flight sign-in, the welcome flow and every open editor each time she switched apps (AE2E-D01).
 // Only a 'checking' that follows 'active' covers; every other non-active answer still removes the app exactly as before.
 const covering=useRef(false);
 if(gate.kind==='active')covering.current=true;else if(gate.kind!=='checking')covering.current=false;
 const appMounted=!hydrated||gate.kind==='active'||(gate.kind==='checking'&&covering.current);
 const blocked=hydrated&&gate.kind!=='active';
 const app=appMounted?<View style={styles.fill} pointerEvents={blocked?'none':'auto'}
  importantForAccessibility={blocked?'no-hide-descendants':'auto'} accessibilityElementsHidden={blocked}>{children}</View>:null;
 if(!blocked)return <View style={styles.fill}>{app}</View>;
 const title=gate.kind==='review'?'Deletion requires privacy review':gate.kind==='pending'?'Account deletion pending':gate.kind==='purged'?'Account permanently deleted':
  gate.kind==='restored'?'Account restored':gate.kind==='checking'?'Checking account access':'Account status unavailable';
 const screen=<Screen><View style={{padding:24,gap:20}}>
  <AppText variant="hero" accessibilityRole="header">{title}</AppText>
  <AppText>{gate.kind==='review'?'Some resources require manual privacy review. Account access remains restricted. Contact support for the resolution status; permanent deletion is not yet complete.':gate.kind==='pending'?(recoveryExpired?'The recovery period has ended. Account access remains restricted while permanent deletion is processed. Deletion is complete only after verification.':'Normal app access and sync are stopped. Use your recovery email to restore your account before the recovery deadline.'):
   gate.kind==='purged'?'The server has verified permanent deletion.':
   gate.kind==='restored'?'Sign in again to use your restored account.':
   'Connect to the internet and retry. An unavailable status does not mean your data has been deleted.'}</AppText>
  {gate.deadline?<AppText>Recovery deadline: {new Date(gate.deadline).toLocaleString()}</AppText>:null}
  <Button label="Check status" onPress={()=>void deletionRuntime.check()}/>
  <Button label="Recovery and support" variant="secondary" onPress={()=>void Linking.openURL('https://herkeys.app/account/restore')}/>
  {gate.kind==='pending'||gate.kind==='review'||gate.kind==='unavailable'?<>
   <AppText>If deletion was requested on the website, enter its private receipt to verify this device’s account status.</AppText>
   <TextInput accessibilityLabel="Private deletion receipt" value={receipt} onChangeText={setReceipt} maxLength={43} secureTextEntry autoCapitalize="none" autoCorrect={false} style={{borderWidth:1,padding:14,borderRadius:8}}/>
   <Button label="Use saved receipt" disabled={importing||receipt.trim().length!==43} onPress={()=>{
    setImporting(true);void deletionRuntime.importReceipt(receipt.trim()).then(()=>{setReceipt('');setReceiptNotice('');})
     .catch(()=>setReceiptNotice('This receipt could not verify the account stored on this device. Check the receipt and connection.'))
     .finally(()=>setImporting(false));
   }}/>
   <AppText accessibilityLiveRegion="polite">{receiptNotice}</AppText>
  </>:null}
  {gate.kind==='unavailable'?<>
   <AppText>Terminal deletion proof is available for 365 days after verification. Missing proof never confirms server deletion. You can explicitly reset this device’s local account data.</AppText>
   <Button label="Reset this device’s local data" variant="secondary" onPress={()=>setResetAccount(deletionRuntime.localAccountId())}/>
   {resetAccount?<>
    <AppText>This permanently removes this device’s data and credentials for its current account. It does not confirm server deletion. Type DELETE LOCAL DATA to continue.</AppText>
    <TextInput accessibilityLabel="Confirm local data reset" value={resetConfirmation} onChangeText={setResetConfirmation} autoCapitalize="characters" autoCorrect={false} style={{borderWidth:1,padding:14,borderRadius:8}}/>
    <Button label="Confirm local reset" disabled={resetConfirmation!=='DELETE LOCAL DATA'||importing} onPress={()=>{
     setImporting(true);void deletionRuntime.resetLocalData(resetConfirmation,resetAccount)
      .catch(()=>setReceiptNotice('Local reset did not complete. Your account namespace may have changed.'))
      .finally(()=>setImporting(false));
    }}/>
   </>:null}
  </>:null}
  {gate.kind==='purged'||gate.kind==='restored'?<Button label="Continue to sign in" onPress={()=>deletionRuntime.continueToSignIn()}/>:null}
 </View></Screen>;
 // The app keeps its place (index 0) whether or not it is covered, so covering it never remounts it.
 return <View style={styles.fill}>{app}<View style={app?StyleSheet.absoluteFill:styles.fill}>{screen}</View></View>;
}

const styles=StyleSheet.create({fill:{flex:1}});
