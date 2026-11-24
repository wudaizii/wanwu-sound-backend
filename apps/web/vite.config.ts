import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {media} from './src/styles/breakpoints.ts';

/** `@media (--short)` → the query named in src/styles/breakpoints.ts, so every page shares one list of screen tiers. */
const customMedia={
 postcssPlugin:'wanwu-custom-media',
 AtRule:{media(rule:{params:string;error:(message:string)=>Error}){
  rule.params=rule.params.replace(/\(--([\w-]+)\)/g,(_,name:string)=>{
   const query=(media as Record<string,string>)[name];
   if(!query)throw rule.error(`Unknown screen tier --${name} (see src/styles/breakpoints.ts)`);
   return query;
  });
 }},
};

export default defineConfig({
  plugins:[react()],
  css:{postcss:{plugins:[customMedia]}},
  server:{port:5290,strictPort:true},
  preview:{port:5291,strictPort:true},
  build:{target:'es2020',sourcemap:false},
});
