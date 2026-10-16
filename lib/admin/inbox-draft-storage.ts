let generation=0;
export function inboxDraftStorageGeneration(){return generation;}
/** Invoked only after successful sign-out. Clear historical plaintext and protected inbox material. */
export function clearInboxDraftStorage(){
 generation++;
 try{for(const key of Object.keys(window.sessionStorage))if(/^wtia:inbox-(?:draft|attempt|protected):/.test(key))window.sessionStorage.removeItem(key);}catch{/* Storage may be denied. */}
 window.dispatchEvent(new Event('hkwtia:inbox-drafts-cleared'));
}
export function purgeLegacyInboxPlaintext(){
 try{for(const key of Object.keys(window.sessionStorage))if(key.startsWith('wtia:inbox-draft:'))window.sessionStorage.removeItem(key);}catch{/* Human typing stays available. */}
}
