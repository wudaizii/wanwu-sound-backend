type Loader=(id:string)=>Promise<AudioBuffer>|null;
let loader:Loader=()=>null;
/** Set only by the application adapter. Pages never sign OSS requests or receive credentials. */
export const setAuthorizedSourceLoader=(next:Loader)=>{loader=next;};
export const authorizedSource=(id:string)=>loader(id);
