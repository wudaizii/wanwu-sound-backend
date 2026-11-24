export type ProviderConfig={baseUrl:string;model:string;apiKey:string};
export type ModelConfig={language:ProviderConfig;music:ProviderConfig};
export type ModelKind=keyof ModelConfig;
export const emptyModelConfig=():ModelConfig=>({
 language:{baseUrl:'',model:'',apiKey:''},music:{baseUrl:'',model:'',apiKey:''},
});

/** Only an in-memory configuration draft. No storage, logging, requests, or provider adapters. */
export function validateModelConfig(config:ModelConfig):Partial<Record<ModelKind,string>>{
 const errors:Partial<Record<ModelKind,string>>={};
 for(const kind of ['language','music'] as const){
  const provider=config[kind];
  if(!provider.baseUrl.trim()&&!provider.model.trim()&&!provider.apiKey.trim())continue;
  if(!provider.baseUrl.trim()){errors[kind]='请填写服务地址。';continue;}
  try{
   const url=new URL(provider.baseUrl.trim());
   if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash){errors[kind]='请填写 HTTP 或 HTTPS 服务地址，不要在地址中附带密钥。';continue;}
  }catch{errors[kind]='请填写完整的服务地址，例如 https://api.example.com/v1。';continue;}
  if(!provider.model.trim())errors[kind]='请填写模型名称或 ID。';
 }
 return errors;
}

export function normalizeModelConfig(config:ModelConfig):ModelConfig{
 const normalize=(provider:ProviderConfig):ProviderConfig=>({baseUrl:provider.baseUrl.trim(),model:provider.model.trim(),apiKey:provider.apiKey.trim()});
 return {language:normalize(config.language),music:normalize(config.music)};
}
