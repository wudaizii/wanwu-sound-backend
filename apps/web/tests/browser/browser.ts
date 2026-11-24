import {access} from 'node:fs/promises';
import {chromium} from 'playwright';
// Frontend tests launch their own browser; no runtime import from the backend/worker repository.
export async function openTestBrowser(){
 let executablePath=chromium.executablePath();
 try{await access(executablePath);}catch{if(process.platform!=='darwin')throw new Error('Install the pinned Playwright Chromium before browser tests');executablePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';await access(executablePath);}
 return chromium.launch({headless:true,executablePath,chromiumSandbox:true});
}
