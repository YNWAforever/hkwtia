/** Inventory evidence is never a browser acceptance PASS. Fail closed on new statuses. */
export function browserAcceptanceStatus(status:string):'BLOCKED'|'NOT RUN'|'BLOCKED: Auth/browser' {
  if(status==='BLOCKED' || status==='NOT RUN') return status;
  return 'BLOCKED: Auth/browser';
}
