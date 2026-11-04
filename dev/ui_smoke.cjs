// Browser interaction tests for the real UI, using explicitly synthetic service responses.
// Screenshots from this script do not prove real QQ/model connectivity.
const { chromium, expect } = (() => {
  const mod = require(require('path').resolve('.tmp/ui-tools/node_modules/playwright'));
  return { ...mod, expect: require('node:assert/strict') };
})();
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
let secret = '';
async function waitFor(predicate, timeout=15000) {
  const deadline = Date.now()+timeout;
  while (!(await predicate())) { if (Date.now()>deadline) throw Error('UI condition timed out'); await new Promise(r=>setTimeout(r,100)); }
}
async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'zhiling-ui-'));
  const connectionFile=path.join(temporary,'connection.json');
  const output=path.resolve('ui-output');fs.mkdirSync(output,{recursive:true});
  const host=spawn('python',['-X','utf8','dev/ui_fixture.py','--connection',connectionFile],{stdio:'ignore'});
  let browser;
  try {
    await waitFor(()=>fs.existsSync(connectionFile));
    const connection=JSON.parse(fs.readFileSync(connectionFile,'utf8'));secret=connection.token;
    const base=`http://127.0.0.1:${connection.port}`;
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const real=await context.request.get(base+'/api/info',{headers:{'X-Token':secret}});
    const info=await real.json();
    expect.equal(info.mode,'install');expect.equal(info.profile.persona,'');
    expect.equal((await context.request.get(base+'/api/info')).status(),403);
    const calls=[];let stage='fresh';let running=true;let agentReady=false;
    const steps=['extract','ports','configs','astrbot','napcat','import','agent','shortcut','login'];
    await page.route('**/api/**',async route=>{
      const req=route.request(), name=new URL(req.url()).pathname;
      const body=req.postDataJSON();let data;
      if(name==='/api/info')data=info;
      else if(name==='/api/ping')return route.continue();
      else if(name==='/api/path') {calls.push(name);info.root='D:\\ZhiLing';data={ok:true,resume:{keys:false,profile:false}};}
      else if(name==='/api/check')data={ok:true,message:'界面测试连接',audio_b64:''};
      else if(name==='/api/keys'){info.saved_keys=['deepseek','siliconflow','app_id','token'];data={ok:true};}
      else if(name==='/api/profile'){info.profile=body;stage='deploying';data={ok:true};}
      else if(name==='/api/progress')data={running:stage==='deploying',waiting:null,finished:stage==='complete',steps:steps.map(key=>({key,title:key,status:stage==='login'&&key==='login'?'doing':stage==='deploying'?'todo':'done',message:''}))};
      else if(name==='/api/login'){stage='complete';data={status:'online',error:''};}
      else if(name==='/api/finish'){expect.equal(stage,'complete');info.mode='status';data={ok:true};}
      else if(name==='/api/status')data={astrbot:running,napcat:running,starting:false,login:running?'online':'offline',qq:'12345678',agent_preparing:false,error:'',steps:[]};
      else if(name==='/api/start'){calls.push(name);running=true;data={ok:true};}
      else if(name==='/api/stop'){calls.push(name);running=false;data={ok:true};}
      else if(name==='/api/agent'){
        if(req.method()==='POST'){calls.push(name+':'+body.action);agentReady=true;}
        data=req.method()==='POST'?{ok:true}:{installed:agentReady,ready:agentReady,busy:false,message:agentReady?'测试引擎已就绪':'尚未部署 Agent',console_url:base};
      }
      else if(name==='/api/consoles')data={dashboard_url:'http://127.0.0.1:6185',napcat_url:'http://127.0.0.1:6099'};
      else throw Error('Unexpected UI request: '+name);
      await route.fulfill({json:data});
    });
    await page.goto(base);
    await page.getByRole('heading',{name:'从一个新的相遇开始',exact:true}).waitFor();
    expect.equal(await page.locator('[data-nav]').count(),0);
    expect.equal(await page.locator('.steps li').count(),6);
    const logo=await context.request.get(base+'/img/logo.png');
    expect.equal(crypto.createHash('sha256').update(await logo.body()).digest('hex'),crypto.createHash('sha256').update(fs.readFileSync('app/web/img/logo.png')).digest('hex'));
    await page.screenshot({path:path.join(output,'onboarding.png')});
    await page.getByRole('button',{name:/开始初始化/}).click();
    await page.getByRole('heading',{name:'连接角色需要的服务',exact:true}).waitFor();
    expect.deepEqual(calls,['/api/path']);
    for(const [id,value] of [['owner_qq','12345678'],['deepseek','ui-test'],['app_id','ui-app'],['token','ui-token'],['siliconflow','ui-memory']]) {
      await page.locator('#'+id).fill(value);await page.locator('#'+id).press('Tab');
    }
    await waitFor(()=>page.locator('#go').isEnabled());await page.locator('#go').click();
    await page.getByRole('heading',{name:'创造你想相遇的角色',exact:true}).waitFor();
    const prompt='这是界面测试资料。\n关系中的其他角色名称应当保留。';
    await page.locator('#persona-file').setInputFiles({name:'角色.md',mimeType:'text/markdown',buffer:Buffer.from(prompt)});
    await waitFor(async()=>await page.locator('#persona').inputValue()===prompt);
    await page.locator('#name').fill('我的角色');await page.locator('#voice').fill('中性的测试声音');
    await page.locator('#go').click();await page.getByRole('heading',{name:'正在安装',exact:true}).waitFor();
    stage='login';
    await page.getByRole('heading',{name:'你的工作区，准备好了',exact:true}).waitFor({timeout:15000});
    await waitFor(()=>page.locator('#fin').isEnabled());await page.locator('#fin').click();
    await page.getByRole('heading',{name:'运行概览',exact:true}).waitFor();
    await waitFor(async()=>await page.locator('#service-qq').textContent()==='已连接');
    expect.equal(await page.locator('.steps').count(),0);expect.equal(await page.locator('[data-nav]').count(),6);
    await page.screenshot({path:path.join(output,'workspace-fixture.png')});
    await page.getByRole('button',{name:'角色设定',exact:true}).click();
    expect.equal(await page.locator('#persona').inputValue(),prompt);expect.equal(await page.locator('.steps').count(),0);
    await page.getByRole('button',{name:'模型与服务',exact:true}).click();await page.getByRole('heading',{name:'模型与服务',exact:true}).waitFor();
    await page.getByRole('button',{name:'账号连接',exact:true}).click();await page.getByRole('heading',{name:'账号连接',exact:true}).waitFor();
    await page.getByRole('button',{name:'Agent 任务',exact:true}).click();
    await page.locator('#agent-prepare').click();await waitFor(async()=>await page.locator('#agent-state').textContent()==='测试引擎已就绪');
    expect.ok(calls.includes('/api/agent:prepare'));
    await page.getByRole('button',{name:'设置与维护',exact:true}).click();
    await waitFor(()=>page.locator('#dashboard-console').isVisible());expect.equal(await page.locator('#dashboard-console').getAttribute('href'),'http://127.0.0.1:6185');
    await page.getByText('卸载与数据移除',{exact:true}).click();await page.locator('#uninstall').click();
    expect.equal(await page.locator('#myes').isEnabled(),false);await page.locator('#mno').click();
    expect.equal(calls.includes('/api/uninstall'),false);
    await page.getByRole('button',{name:'运行概览',exact:true}).click();await page.locator('#down').click();
    await waitFor(async()=>await page.locator('#service-role').textContent()==='未运行');expect.ok(calls.includes('/api/stop'));
    await page.setViewportSize({width:900,height:700});
    expect.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.getByRole('button',{name:'角色设定',exact:true}).click();
    expect.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.setViewportSize({width:700,height:800});
    expect.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.getByRole('button',{name:'运行概览',exact:true}).click();
    await page.getByRole('heading',{name:'运行概览',exact:true}).waitFor();
    expect.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'UI_REPORT.json'),JSON.stringify({setup_to_workspace:true,distinct_navigation:true,prompt_import_preserved:true,service_controls:true,maintenance_confirmation:true,responsive_layout:true,page_errors:errors,scope:'真实前端的合成交互测试；服务状态为测试数据，未验证真实QQ或模型连接'},null,2));
    console.log('UI interaction, setup transition, workspace controls and responsive checks passed.');
  } finally {if(browser)await browser.close();host.kill();fs.rmSync(temporary,{recursive:true,force:true});}
}
main().catch(e=>{console.error(String(e.stack||e).replaceAll(secret||'__no_token__','[redacted]'));process.exitCode=1;});
