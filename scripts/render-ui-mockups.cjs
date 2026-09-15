const {app,WebContentsView}=require('electron');
const fs=require('node:fs');
const path=require('node:path');

app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const output=path.join(__dirname,'..','ui-mockups');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const canvasScript=fs.readFileSync(path.join(__dirname,'..','node_modules','html2canvas','dist','html2canvas.min.js'),'utf8');
async function injectCanvas(view){await view.webContents.executeJavaScript(`Object.defineProperty(window,'innerWidth',{configurable:true,get:()=>1440});Object.defineProperty(window,'innerHeight',{configurable:true,get:()=>900});true`);await view.webContents.executeJavaScript(canvasScript)}
async function reload(view){await view.webContents.executeJavaScript("history.replaceState(null,'',location.pathname+location.search)");const ready=new Promise(resolve=>view.webContents.once('did-finish-load',resolve));view.webContents.reload();await ready;await delay(700);await injectCanvas(view)}
async function clickText(view,text){await view.webContents.executeJavaScript(`(()=>{const el=[...document.querySelectorAll('button,[role="button"],.attentionRow,.taskTitle')].find(e=>e.textContent.trim().includes(${JSON.stringify(text)}));if(!el)throw new Error('Missing UI control: '+${JSON.stringify(text)});el.click()})()`);await delay(500)}
async function clickSelector(view,selector){await view.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing UI selector: '+${JSON.stringify(selector)});el.click()})()`);await delay(500)}
async function shot(view,name){const dataUrl=await view.webContents.executeJavaScript(`html2canvas(document.documentElement,{backgroundColor:'#f4f7fb',logging:false,scale:1,width:1440,height:900,windowWidth:1440,windowHeight:900,scrollX:0,scrollY:0}).then(canvas=>canvas.toDataURL('image/png'))`);fs.writeFileSync(path.join(output,name),Buffer.from(dataUrl.split(',')[1],'base64'))}

app.whenReady().then(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const win=new WebContentsView({webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:false,preload:path.join(__dirname,'mockup-preload.cjs')}});
 win.setBounds({x:0,y:0,width:1440,height:900});
 win.webContents.on('console-message',event=>console.error('RENDERER:',event.message));
 win.webContents.on('render-process-gone',(_event,details)=>console.error('RENDERER GONE:',details));
 await win.webContents.loadFile(path.join(__dirname,'..','dist','index.html'));
 await delay(1200);
 await injectCanvas(win);
 console.error(await win.webContents.executeJavaScript(`JSON.stringify({api:typeof window.priorityDesk,root:document.querySelector('#root')?.textContent?.slice(0,200),body:document.body.innerHTML.slice(0,200)})`));
 await shot(win,'01-dashboard.png');
 await clickText(win,'Next 7 days');
 await shot(win,'01b-dashboard-next-7-days-drilldown.png');
 await reload(win);
 await clickSelector(win,'button[aria-label="Use dark theme"]');
 await shot(win,'01c-dashboard-dark.png');
 await clickSelector(win,'button[aria-label="Use light theme"]');
 await clickText(win,'All Tasks');
 await shot(win,'02-all-tasks.png');
 await clickText(win,'Prepare customer presentation');
 await shot(win,'03-task-details.png');
 await reload(win);
 await clickText(win,'Projects');
 await shot(win,'03b-project-progress.png');
 await clickText(win,'Customer Delivery');
 await shot(win,'03c-project-drilldown.png');
 await reload(win);
 await clickText(win,'People');
 await shot(win,'04-people.png');
 await reload(win);
 await clickText(win,'Settings');
 await shot(win,'05-settings.png');
 await reload(win);
 await clickText(win,'Logs and Diagnostics');
 await shot(win,'06-logs-diagnostics.png');
 await reload(win);
 await clickText(win,'Dependency load by person');
 await shot(win,'07-dependency-load.png');
 await clickText(win,'Marco Bianchi');
 await shot(win,'08-dependency-drilldown.png');
 await reload(win);
 await clickText(win,'Calendar');
 await shot(win,'09-calendar.png');
 await clickSelector(win,'button[aria-label*="9/15/2026"]');
 await shot(win,'10-calendar-day.png');
 await clickText(win,'Order replacement component');
 await shot(win,'11-calendar-task.png');
 win.webContents.close();app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
