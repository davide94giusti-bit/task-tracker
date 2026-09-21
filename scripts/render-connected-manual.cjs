const { app, WebContentsView } = require('electron');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const output = path.join(__dirname, '..', 'apps', 'connected-web', 'public', 'manual');
const page = path.join(__dirname, '..', 'dist-connected', 'index.html');
const html2canvas = readFileSync(path.join(__dirname, '..', 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js'), 'utf8');
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function shot({ view, name, width = 1180, height = 760, action }) {
  const browser = new WebContentsView({ webPreferences: { sandbox: false, contextIsolation: true } });
  browser.setBounds({ x: 0, y: 0, width, height });
  await browser.webContents.loadFile(page, { query: { view } });
  await wait(700);
  if (action) {
    await browser.webContents.executeJavaScript(action);
    await wait(350);
  }
  await browser.webContents.executeJavaScript(html2canvas);
  const data = await browser.webContents.executeJavaScript(`html2canvas(document.documentElement,{backgroundColor:getComputedStyle(document.body).backgroundColor,logging:false,scale:1,width:${width},height:${height},windowWidth:${width},windowHeight:${height}}).then(canvas=>canvas.toDataURL('image/png'))`);
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, name), Buffer.from(data.split(',')[1], 'base64'));
  browser.webContents.close();
}

app.whenReady().then(async () => {
  await shot({ view: 'dashboard', name: 'navigation.png', width: 390, height: 844 });
  await shot({ view: 'dashboard', name: 'dashboard.png' });
  await shot({ view: 'tasks', name: 'tasks.png' });
  await shot({ view: 'tasks', name: 'task-editor.png', action: `Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('New task'))?.click()` });
  await shot({ view: 'tasks', name: 'checklist.png', action: `Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('New task'))?.click();setTimeout(()=>Array.from(document.querySelectorAll('*')).find(node=>node.textContent==='Checklist')?.scrollIntoView({block:'center'}),100)` });
  await shot({ view: 'dependencies', name: 'dependencies.png' });
  await shot({ view: 'projects', name: 'projects.png' });
  await shot({ view: 'people', name: 'people.png' });
  await shot({ view: 'settings', name: 'settings.png' });
  await shot({ view: 'access', name: 'access.png' });
  await shot({ view: 'diagnostics', name: 'diagnostics.png' });
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
