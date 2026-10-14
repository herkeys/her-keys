import {useState} from 'react';
import {Linking,ScrollView,TextInput,View} from 'react-native';
import {AppText,Button} from '../../design/components';
import {useAccount} from '../../store/AccountProvider';
import {deletionRuntime} from '../../store/deletionRuntimeInstance';
export function DeleteAccountPanel({onBack}:{onBack:()=>void}) {
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const account=useAccount();
 async function work(fn:()=>Promise<unknown>){if(busy)return;setBusy(true);try{await fn();}catch{setNotice('This did not complete. Verify your identity recently and try again. Your deletion status is checked before access resumes.');}finally{setBusy(false);}}
 return <ScrollView contentContainerStyle={{padding:24,gap:20}}>
  <AppText variant="hero" accessibilityRole="header">Privacy & Data</AppText>
  <AppText variant="title">Delete Account</AppText>
  <AppText>Confirming stops account access and synchronization immediately. You have 30 days from the server-recorded request to recover through email. After that, automated permanent deletion removes your account-owned household, child, task, calendar, private, and associated records. Shared ownership exceptions are reviewed to protect other members.</AppText>
  <AppText>Account deletion does not cancel an Apple or Google subscription. Cancel Premium through your store. Provider records and backups may follow their disclosed retention schedules; see our Privacy Policy.</AppText>
  <AppText>After verified purge, only minimal receipt-hash proof, verification times, aggregate counts and expiry are kept for 365 days. A daily job removes expired proof. Missing proof never confirms deletion; an explicit local reset remains available. Completion-email delivery uses a separate encrypted outbox for at most seven days.</AppText>
  <Button variant="secondary" label="Apple subscriptions" onPress={()=>void Linking.openURL('https://apps.apple.com/account/subscriptions')}/>
  <Button variant="secondary" label="Google Play subscriptions" onPress={()=>void Linking.openURL('https://play.google.com/store/account/subscriptions')}/>
  <Button variant="ghost" label="Privacy Policy" onPress={()=>void Linking.openURL('https://herkeys.app/privacy')}/>
  <AppText>For your security, verify your account within 10 minutes before confirming. You can use a fresh sign-in or request a sign-in code for your existing account.</AppText>
  <TextInput accessibilityLabel="Account email" placeholder="Account email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={{borderWidth:1,borderColor:'#999',padding:14,borderRadius:8}}/>
  <Button label="Send sign-in code" disabled={busy||!email} onPress={()=>void work(async()=>{const result=await account.requestEmailOtp(email);setNotice(result.kind==='sent'?'Check your email for a sign-in code.':'If a code is available, check your email.');})}/>
  <TextInput accessibilityLabel="Sign-in code" placeholder="Sign-in code" keyboardType="number-pad" value={code} onChangeText={setCode} style={{borderWidth:1,borderColor:'#999',padding:14,borderRadius:8}}/>
  <Button label="Verify code" disabled={busy||!code} onPress={()=>void work(async()=>{const result=await account.verifyEmailOtp(email,code);setNotice(result.outcome.kind==='verified'?'Identity verified. You can now confirm deletion.':'Verification did not complete.');})}/>
  <AppText accessibilityLiveRegion="polite">{notice}</AppText>
  <View style={{gap:12}}>
   <Button label={busy?'Working…':'Confirm account deletion'} disabled={busy} onPress={()=>void work(()=>deletionRuntime.request())}/>
   <Button variant="ghost" label="Back to Your Account" disabled={busy} onPress={onBack}/>
  </View>
 </ScrollView>;
}
