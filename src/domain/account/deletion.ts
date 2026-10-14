export interface DeletionReceipt { accountId:string; proof:string; deadline?:string }
export function parseDeletionReceipt(raw:string|null):DeletionReceipt|null {
 if(raw===null) return null;
 const v=JSON.parse(raw);
 if(!v || typeof v.accountId!=='string' || !/^[0-9a-f-]{36}$/i.test(v.accountId) || typeof v.proof!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(v.proof))
  throw new Error('Unreadable deletion receipt');
 return v;
}
export function canEraseDeletedNamespace(status:unknown,receipt:DeletionReceipt,boundAccountId:string|null,now:number=Date.now()):boolean {
 if(!status || typeof status!=='object' || receipt.accountId!==boundAccountId)return false;
 const value=status as {status?:string;purged_at?:unknown;verified_at?:unknown;expires_at?:unknown};
 return value.status==='purged' && typeof value.purged_at==='string' && Number.isFinite(Date.parse(value.purged_at))
  && typeof value.verified_at==='string' && Number.isFinite(Date.parse(value.verified_at))
  && typeof value.expires_at==='string' && Date.parse(value.expires_at)>now;
}
export function canResetLocalNamespace(confirmation:string,expected:string|null,current:string|null):boolean {
 return confirmation==='DELETE LOCAL DATA' && expected!==null && expected===current;
}
