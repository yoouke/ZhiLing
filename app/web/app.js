"use strict";
// 织灵向导。没有构建步骤，纯原生 JS。

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, body) {
  const opt = { headers: { "X-Token": window.TOKEN } };
  if (body !== undefined) {
    opt.method = "POST";
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  try {
    const r = await fetch(path, opt);
    return await r.json();
  } catch (e) {
    return { ok: false, message: "和安装程序断开了，关掉窗口重新双击试试" };
  }
}

setInterval(() => api("/api/ping", {}), 3000);
api("/api/ping", {});

const PAGES = ["本机环境", "模型服务", "角色设定", "准备运行", "连接账号", "完成"];
const SAYS = [
  "从这里开始，创造属于你的角色。",
  "配置角色使用的模型、记忆与语音服务。",
  "由你决定角色是谁、如何表达。",
  "正在准备运行环境与能力组件。",
  "扫码连接角色使用的 QQ 账号。",
  "连接已准备，可以开始交流。",
];
// 状态页使用宿主文案，不代替用户创作的角色说话。
const STATUS_SAY = "管理角色、连接与任务服务。";

const S = { page: 0, info: null, progress: null, timers: [] };

function clearTimers() {
  S.timers.forEach(clearInterval);
  S.timers = [];
}

const NAV = [
  ["overview", "运行概览", "grid", pageStatus],
  ["role", "角色设定", "person", pageProfile],
  ["models", "模型与服务", "layers", pageKeys],
  ["connection", "账号连接", "link", pageConnections],
  ["agent", "Agent 任务", "spark", pageAgent],
  ["settings", "设置与维护", "settings", pageSettings],
];
function icon(name) {
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
    link: '<path d="m10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2-1 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    play: '<path d="m8 4 13 8-13 8V4Z"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}
function shell(page, title, sub, bodyHtml, footHtml) {
  const setup = S.mode !== "status";
  document.body.dataset.mode = setup ? "setup" : "workspace";
  if (setup) {
    const steps = PAGES.map((n, i) => `<li class="${i === page ? "on" : i < page ? "past" : ""}" ${i === page ? 'aria-current="step"' : ''}><span class="n">${i < page ? "✓" : i + 1}</span><span>${n}</span></li>`).join("");
    $("#app").innerHTML = `<div class="setup-window">
      <header class="titlebar"><div class="brand-line"><img src="/img/favicon.png" alt=""><strong>织灵</strong><span>ZhiLing</span></div><span class="mode-label">本机初始化</span></header>
      <div class="setup-layout"><aside class="setup-intro"><span class="eyebrow">让想象，成为日常。</span><h2>为你的角色，<br>织一个世界。</h2><p>人格、声音、记忆与能力，<br>从你自己的设定开始。</p><div class="brand-art"><img src="/img/logo.png" alt="织灵蝴蝶标志"></div><div class="intro-bottom"><span>本地优先</span><i></i><span>自由创作</span><i></i><span>由你定义</span></div></aside>
      <main class="main setup-panel"><ol class="steps" aria-label="初始化步骤">${steps}</ol><div class="page-heading"><span class="eyebrow">${String(Math.max(page, 0) + 1).padStart(2,"0")} / 初始化</span><h1>${title}</h1><p class="sub">${sub}</p></div><div class="body">${bodyHtml}</div><footer class="foot">${footHtml || ""}</footer></main></div>
    </div>`;
  } else {
    const active = S.view || "overview";
    const label = NAV.find(n => n[0] === active)?.[1] || "工作台";
    $("#app").innerHTML = `<div class="workspace-window">
      <aside class="workspace-side"><div class="brand-line"><img src="/img/favicon.png" alt=""><div><strong>织灵</strong><span>ZhiLing</span></div></div><div class="nav-caption">我的工作空间</div><nav aria-label="工作台导航">${NAV.map(([id, name, glyph])=>`<button type="button" aria-label="${name}" title="${name}" data-nav="${id}" class="nav-item ${id === active ? 'active' : ''}" ${id === active ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${name}</span>${id === active ? '<i></i>' : ''}</button>`).join("")}</nav><div class="sidebar-bottom"><img src="/img/favicon.png" alt=""><div><strong>本机工作区</strong><span>${esc(S.info?.version || "开发预览")}</span></div></div></aside>
      <div class="workspace-content"><header class="workspace-top"><div>我的工作空间 <span>/</span> <strong>${label}</strong></div><span class="local-badge"><i></i> 本地工作区</span></header><main class="main workspace-main"><div class="page-heading"><span class="eyebrow">${active === 'overview' ? '日常，从这里继续。' : '角色的每一面，由你定义。'}</span><h1>${title}</h1><p class="sub">${sub}</p></div><div class="body">${bodyHtml}</div>${footHtml ? `<footer class="foot">${footHtml}</footer>` : ''}</main></div>
    </div>`;
    document.querySelectorAll("[data-nav]").forEach(button => button.onclick = () => NAV.find(n=>n[0] === button.dataset.nav)[3]());
  }
}

/** 居中弹窗确认。opts: {title, body, ok, danger, need}（need 填了就要照着抄一遍才能点确认）*/
function confirmBox(opts) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="mt">
      <h2 id="mt">${opts.title}</h2>
      <div class="mbody">${opts.body}</div>
      ${opts.need ? `<label class="field"><span>想继续，请在下面抄一遍「${esc(opts.need)}」</span>
        <input id="mneed" type="text" autocomplete="off" spellcheck="false"></label>` : ""}
      <div class="mfoot"><button id="mno">取消</button>
        <button id="myes" class="${opts.danger ? "danger" : "primary"}" ${opts.need ? "disabled" : ""}>${esc(opts.ok || "确定")}</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const close = (v) => { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => e.key === "Escape" && close(false);
    document.addEventListener("keydown", onKey);
    wrap.onclick = (e) => e.target === wrap && close(false);
    $("#mno", wrap).onclick = () => close(false);
    $("#myes", wrap).onclick = () => close(true);
    if (opts.need) {
      const inp = $("#mneed", wrap);
      inp.oninput = () => ($("#myes", wrap).disabled = inp.value.trim() !== opts.need);
      inp.focus();
    } else $("#myes", wrap).focus();
  });
}

function miniProgress() {
  const p = S.progress;
  if (!p || !p.steps.length) return `<div class="minibar">后台准备中…<div class="bar"><i style="width:3%"></i></div></div>`;
  const done = p.steps.filter((s) => s.status === "done").length;
  const cur = p.steps.find((s) => s.status === "doing" || s.status === "error");
  const label = cur ? (cur.status === "error" ? "后台出错了，到第 4 步看看" : (p.waiting ? "等你填完这页" : cur.title + "…")) : "后台准备好了";
  return `<div class="minibar">后台：${esc(label)}<div class="bar"><i style="width:${Math.max(3, (done / p.steps.length) * 100)}%"></i></div></div>`;
}

function pollProgress() {
  const tick = async () => {
    S.progress = await api("/api/progress");
    const el = $("#mini");
    if (el) el.innerHTML = miniProgress();
    if (S.page === 3) renderTasks();
  };
  tick();
  S.timers.push(setInterval(tick, 1500));
}

// ---------------- 第 1 页：位置 ----------------
function pagePath() {
  S.page = 0;
  shell(0, S.info.root ? "继续准备你的工作区" : "从一个新的相遇开始", S.info.root ? "检测到上次未完成的初始化，可以从已有进度继续。" : "只需完成一次配置，之后打开织灵即可进入日常工作台。", `
    <div class="setup-summary"><span class="summary-icon">${icon("spark")}</span><div><strong>一个入口，准备好角色的日常</strong><p>配置本机环境、角色设定与通信账号。</p></div></div><details class="help"><summary>QQ 账号使用提示</summary><p>请使用独立 QQ 小号。第三方协议登录可能受到平台限制；登录与验证操作需要你本人完成。</p></details>
    <details class="note"><summary>许可与组件信息</summary><p>组件与素材分别遵循各自许可。完整信息见随附 THIRD_PARTY_NOTICES.md 和组件目录中的许可证。账号登录与 API 授权由你完成。</p></details>
    <label class="field">
      <span>装在哪</span>
      <input id="path" type="text" value="${esc(S.info.root || S.info.default_path)}" spellcheck="false" autocomplete="off">
    </label>
    <div class="note">要留出 10G 左右的空间。路径只能用英文、不能有空格，比如 <code>D:\\ZhiLing</code>。以前装过的，填同一个位置会接着上次的进度。</div>
    <div id="msg" class="msg" role="alert"></div>`,
    `<span></span><button class="primary" id="go">${S.info.root ? "继续初始化" : "开始初始化"} ${icon("arrow")}</button>`);
  const go = async () => {
    $("#go").disabled = true;
    const selected = $("#path").value.trim();
    const r = S.info.root && selected === S.info.root ? await api("/api/resume", {}) : await api("/api/path", { path: selected });
    $("#go").disabled = false;
    if (!r.ok) {
      $("#msg").className = "msg bad";
      $("#msg").textContent = r.message;
      return;
    }
    S.info = await api("/api/info");
    pollProgress();
    if (r.resume?.keys && r.resume?.profile) pageTasks();
    else if (r.resume?.keys) pageProfile();
    else pageKeys();
  };
  $("#go").onclick = go;
  $("#path").onkeydown = (e) => e.key === "Enter" && go();
}

// ---------------- 第 2 页：key ----------------
const HELP = {
  qq: `绑定用于管理角色和确认操作的主人身份。填写你的常用账号，<b>不是</b>机器人登录的账号。`,
  deepseek: `<ol>
    <li>打开 <a href="https://platform.deepseek.com/" target="_blank">platform.deepseek.com</a>，用手机号登录。认准这个地址，别点广告和中转站。</li>
    <li>左侧「充值」，先充小额（几块钱就够试很久）。</li>
    <li>左侧「API keys」→「创建 API key」，名字随便填。</li>
    <li>弹出来的 key 只显示一次，点「复制」粘到这里。</li></ol>`,
  doubao: `<ol>
    <li>打开 <a href="https://www.volcengine.com/" target="_blank">volcengine.com</a> 注册，做<b>个人实名认证</b>（必须）。</li>
    <li>打开<b>旧版</b>豆包语音控制台 <a href="https://console.volcengine.com/speech/app" target="_blank">console.volcengine.com/speech/app</a>，「应用管理」里没有应用就「创建应用」。</li>
    <li>左侧「API 服务中心」，模型选「豆包音频生成模型 1.0」，选你的应用，点<b>「试用」</b>领免费额度。<b>先别点「开通」</b>，开通会开始收费，试用额度也会清零。</li>
    <li>同一页复制 <b>APP ID</b> 和 <b>Access Token</b>。火山方舟的 API Key、同一页的 Secret Key 都不是这个。</li></ol>
    按语音时长收费，约 1 元/分钟，一条语音几分钱。`,
  siliconflow: `<ol>
    <li>打开 <a href="https://www.siliconflow.cn/" target="_blank">siliconflow.cn</a> 注册并登录。</li>
    <li>左侧「API 密钥」→「新建 API 密钥」，描述填「织灵记忆」。</li>
    <li>点那一行的「密钥（点击复制）」，粘到这里。</li></ol>
    记忆用的 <code>BAAI/bge-m3</code> 模型是免费的。`,
};

function keyField(id, label, help, type = "password", extra = "") {
  return `<label class="field" id="f-${id}">
    <span>${label} <em class="badge" id="b-${id}"></em></span>
    <input id="${id}" type="${type}" spellcheck="false" autocomplete="off" ${extra}>
    <div class="msg" id="m-${id}"></div>
  </label>
  <details class="help"><summary>去哪拿？</summary>${help}</details>`;
}

function setBadge(id, state, msg) {
  const b = $("#b-" + id), m = $("#m-" + id), f = $("#f-" + id);
  if (!b) return;
  b.className = "badge " + state;
  b.textContent = { ok: "✓ 可以用", bad: "✗ 不对", wait: "检查中…", "": "" }[state];
  m.className = "msg " + (state === "bad" ? "bad" : state === "ok" ? "ok" : "");
  m.textContent = msg || "";
  f.classList.toggle("bad", state === "bad");
}

function pageKeys() {
  S.page = 1;
  S.view = "models";
  const saved = (S.info.saved_keys || []);
  const ph = (f, normal) => saved.includes(f) ? 'placeholder="已保存，不用改就留空"' : normal;
  shell(1, S.mode === "status" ? "模型与服务" : "连接角色需要的服务",
    S.mode === "status" ? "保留已保存的配置，或修改后重新联动。主程序凭据使用 Windows 加密存储。"
      : "填写后会检查连接。主程序凭据使用 Windows 加密存储；运行组件配置请妥善保管。", `
    ${keyField("owner_qq", "你的大号 QQ", HELP.qq, "text", 'inputmode="numeric" placeholder="比如 123456789"')}
    ${keyField("deepseek", "DeepSeek API key（对话模型）", HELP.deepseek, "password", ph("deepseek", 'placeholder="sk-..."'))}
    <div class="grid2">
      <label class="field" id="f-app_id"><span>豆包语音 APP ID <em class="badge" id="b-app_id"></em></span>
        <input id="app_id" type="text" spellcheck="false" autocomplete="off" ${ph("app_id", "")}><div class="msg" id="m-app_id"></div></label>
      <label class="field" id="f-token"><span>豆包语音 Access Token</span>
        <input id="token" type="password" spellcheck="false" autocomplete="off" ${ph("token", "")}><div class="msg" id="m-token"></div></label>
    </div>
    <details class="help"><summary>豆包语音去哪拿？（用于语音与唱歌）</summary>${HELP.doubao}</details>
    ${keyField("siliconflow", "硅基流动 API key（记忆检索）", HELP.siliconflow, "password", ph("siliconflow", ""))}
    ${S.mode === "status" ? "" : `<div id="mini">${miniProgress()}</div>`}`,
    `<button id="back">${S.mode === "status" ? "返回" : "上一步"}</button>
     <button class="primary" id="go" disabled>${S.mode === "status" ? "保存并重新联动" : "下一步"}</button>`);

  // 改设置时留空 = 用已保存的那个，所以空着也算过关；新装时每项都得填
  const blankOk = (f) => S.mode === "status" && saved.includes(f) && !$("#" + f).value.trim();
  const state = { owner_qq: false, deepseek: false, doubao: false, siliconflow: false };
  const refresh = () => ($("#go").disabled = !["owner_qq", "deepseek", "siliconflow"].every(
    (f) => state[f] || (f !== "owner_qq" && blankOk(f))) ||
    !(state.doubao || (blankOk("app_id") && blankOk("token"))));
  const val = (id) => $("#" + id).value.trim();

  const checkQQ = () => {
    const ok = /^\d{5,12}$/.test(val("owner_qq"));
    state.owner_qq = ok;
    setBadge("owner_qq", val("owner_qq") ? (ok ? "ok" : "bad") : "", ok || !val("owner_qq") ? "" : "QQ 号只能是 5 到 12 位数字");
    refresh();
  };
  const check = async (field) => {
    const badgeId = field === "doubao" ? "app_id" : field;
    const body = field === "doubao" ? { field, app_id: val("app_id"), token: val("token") } : { field, value: val(field) };
    if (field === "doubao" ? !(body.app_id && body.token) : !body.value) {
      state[field] = false;
      setBadge(badgeId, "", "");
      return refresh();
    }
    state[field] = false;
    refresh();
    setBadge(badgeId, "wait", field === "doubao" ? "豆包要试念一句，十几秒…" : "");
    const r = await api("/api/check", body);
    state[field] = !!r.ok;
    setBadge(badgeId, r.ok ? "ok" : "bad", r.message);
    refresh();
  };
  $("#owner_qq").oninput = checkQQ;
  $("#owner_qq").value = S.info.owner_qq || "";
  if (S.info.owner_qq) checkQQ();
  ["deepseek", "siliconflow"].forEach((f) => ($("#" + f).onchange = () => check(f)));
  ["app_id", "token"].forEach((f) => ($("#" + f).onchange = () => check("doubao")));
  $("#back").onclick = S.mode === "status" ? pageStatus : pagePath;
  $("#go").onclick = async () => {
    $("#go").disabled = true;
    $("#go").innerHTML = '<span class="spin"></span> 确认中';
    const r = await api("/api/keys", { owner_qq: val("owner_qq"), deepseek: val("deepseek"), siliconflow: val("siliconflow"),
      app_id: val("app_id"), token: val("token") });
    if (r.ok) return S.mode === "status" ? applySettings() : pageProfile();
    $("#go").textContent = S.mode === "status" ? "保存并重新联动" : "下一步";
    for (const [k, msg] of Object.entries(r.errors || {})) setBadge(k === "doubao" ? "app_id" : k, "bad", msg);
    refresh();
  };
}

// ---------------- 第 3 页：个性化 ----------------
const MEME_NAMES = { "blue-fat-fish-meme-pack": "蓝色角色表情包（157 张）", "deepseek-fanart-meme-pack": "DeepSeek 二创（174 张）" };

function pageProfile() {
  S.page = 2;
  S.view = "role";
  const p = S.info.profile;
  const presets = S.info.voice_presets.map((v, i) =>
    `<button class="chip${v.voice === p.voice ? " on" : ""}" data-i="${i}" type="button">${esc(v.name)}</button>`).join("");
  const memes = Object.entries(p.memes).map(([id, on]) =>
    `<label><input type="checkbox" data-meme="${esc(id)}" ${on ? "checked" : ""}> ${esc(MEME_NAMES[id] || id)}</label>`).join("");
  shell(2, S.mode === "status" ? "角色设定" : "创造你想相遇的角色", "填写自己的角色设定，或粘贴已有提示词。声音和表情能力继续使用下方配置。", `
    <label class="field"><span>名字</span><input id="name" type="text" maxlength="20" value="${esc(p.name)}"></label>
    <label class="field"><span>从文件导入提示词（Markdown / TXT）</span><input id="persona-file" type="file" accept=".md,.txt,text/plain,text/markdown"></label>
    <label class="field"><span>人格设定（描述或粘贴提示词）</span><textarea id="persona" rows="7">${esc(p.persona)}</textarea></label>
    <div class="note" style="margin-top:-8px">主人身份在前一步绑定；提示词可以直接导入并编辑，不需要手动填写身份占位符。</div>
    <label class="field"><span>声音（用一句话描述角色的声音）</span>
      <div class="row"><input id="voice" type="text" value="${esc(p.voice)}"><button id="listen" type="button">▶ 试听</button></div>
      <div class="row" style="gap:8px">${presets}</div>
      <div class="msg" id="m-voice"></div></label>
    <audio id="player" hidden></audio>
    <div class="field"><span style="font-weight:600">表情包（至少留一套）</span><div class="checks">${memes}</div>
      <div class="msg">想加自己的图：装好后在 QQ 里直接发给角色说「存一下」，或者在后台的表情包管理里上传。</div></div>
    <div id="msg" class="msg bad" role="alert"></div>
    ${S.mode === "status" ? "" : `<div id="mini">${miniProgress()}</div>`}`,
    `<button id="back">${S.mode === "status" ? "返回工作台" : "上一步"}</button><button class="primary" id="go">${S.mode === "status" ? "保存并重新联动" : "下一步"}</button>`);

  $("#persona-file").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (!/\.(md|txt)$/i.test(file.name)) throw new Error("请选择 Markdown 或 TXT 文档");
      if (file.size > 256 * 1024) throw new Error("提示词文档请控制在 256 KB 以内");
      const text = new TextDecoder("utf-8", {fatal: true}).decode(await file.arrayBuffer());
      if (!text.trim()) throw new Error("文档没有可导入的文字");
      if ($("#persona").value && !(await confirmBox({title: "替换当前提示词", body: "<p>用所选文档替换编辑框里的文字，确认保存后才会应用到角色。</p>", ok: "导入文档"}))) return;
      $("#persona").value = text;
      $("#msg").textContent = "";
    } catch (error) {
      $("#msg").textContent = error instanceof TypeError ? "文档编码无法读取，请另存为 UTF-8 后重试" : error.message;
    } finally {
      event.target.value = "";
    }
  };
  document.querySelectorAll(".chip").forEach((b) => (b.onclick = () => {
    $("#voice").value = S.info.voice_presets[b.dataset.i].voice;
    document.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b));
  }));
  $("#listen").onclick = async () => {
    $("#listen").disabled = true;
    $("#m-voice").className = "msg";
    $("#m-voice").textContent = "豆包在念，十几秒…（每次试听花几分钱）";
    const r = await api("/api/preview_voice", { voice: $("#voice").value, name: $("#name").value });
    $("#listen").disabled = false;
    if (!r.ok) {
      $("#m-voice").className = "msg bad";
      $("#m-voice").textContent = r.message;
      return;
    }
    $("#m-voice").textContent = "";
    const a = $("#player");
    a.src = "data:audio/mpeg;base64," + r.audio_b64;
    a.play();
  };
  const collect = () => {
    const memes = {};
    document.querySelectorAll("[data-meme]").forEach((c) => (memes[c.dataset.meme] = c.checked));
    return { name: $("#name").value.trim(), persona: $("#persona").value, voice: $("#voice").value.trim(), memes };
  };
  $("#back").onclick = S.mode === "status" ? pageStatus : pageKeys;
  $("#go").onclick = async () => {
    const prof = collect();
    const r = await api("/api/profile", prof);
    if (!r.ok) return ($("#msg").textContent = r.message);
    S.info.profile = prof;
    S.mode === "status" ? applySettings() : pageTasks();
  };
}

// ---------------- 第 4 页：安装进度 ----------------
const ICON = { done: "✓", error: "!", doing: "", todo: "" };

function renderTasks() {
  const p = S.progress;
  const ul = $("#tasks");
  if (!ul || !p) return;
  ul.innerHTML = p.steps.filter((s) => s.key !== "login").map((s) => `
    <li class="${s.status}"><span class="ic">${ICON[s.status]}</span><div>${esc(s.title)}
      ${s.status === "error" ? `<div class="t-msg" style="white-space:pre-wrap">${esc(s.message)}</div>` : ""}
      ${s.status === "doing" && s.key === "import" ? `<div class="t-wait">要装插件、写人格、接语音，几分钟</div>` : ""}
      ${s.status === "doing" && s.key === "extract" ? `<div class="t-wait">文件多，大概一两分钟</div>` : ""}
    </div></li>`).join("");
  const err = p.steps.some((s) => s.status === "error");
  $("#retry").hidden = !err;
  const login = p.steps.find((s) => s.key === "login");
  if (login && (login.status === "doing" || login.status === "done") && S.page === 3) pageQR();
}

function pageTasks() {
  S.page = 3;
  shell(3, "正在安装", "正在准备运行环境、连接与能力组件。每一步都会显示实际结果。", `
    <ul class="tasks" id="tasks"></ul>
    <div class="note">关掉窗口也没关系，下次打开织灵、选择同一个安装位置，会接着装。</div>`,
    `<span></span><button class="primary" id="retry" hidden>重试</button>`);
  $("#retry").onclick = async () => {
    await api("/api/retry", {});
    $("#retry").hidden = true;
  };
  renderTasks();
}

// ---------------- 第 5 页：扫码 ----------------
const LOGIN_TEXT = {
  starting: ["正在准备二维码…", "wait"],
  need_scan: ["用登着小号的手机 QQ 扫一下", "wait"],
  scanned: ["扫到了，在手机上点「确认登录」", "wait"],
  online: ["登录成功", "on"],
  offline: ["小号掉线了，等一下会出新的二维码", "off"],
  error: ["二维码过期了，正在换一张", "off"],
};

function qrBlock() {
  return `<div class="qr">
    <div class="frame"><img id="qr" alt="QQ 登录二维码" hidden><span id="qrwait" class="spin"></span></div>
    <div class="status-big" style="font-size:16px"><span class="dot wait" id="dot"></span><span id="qrstate" role="status">正在准备二维码…</span></div>
    <div><button id="reqr" class="ghost">重新获取二维码</button></div>
    <div class="msg" id="qrmsg">二维码不出来？等半分钟。一直不出来，可能是杀毒软件拦了 NapCat，给安装目录添加信任后重开。</div>
  </div>`;
}

function bindRefreshQR() {
  const btn = $("#reqr");
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true;
    const r = await api("/api/refresh_qr", {});
    $("#qrmsg").textContent = r.message || "";
    setTimeout(() => { btn.disabled = false; }, 3000);
  };
}

function pollLogin(onOnline) {
  const tick = async () => {
    const r = await api("/api/login");
    const [text, dot] = LOGIN_TEXT[r.status] || LOGIN_TEXT.starting;
    if (!$("#qrstate")) return;
    $("#qrstate").textContent = text;
    $("#dot").className = "dot " + dot;
    // NapCat 说「已登录」时换码没用，得点按钮重启它，所以要把原因显示出来
    if (r.error && $("#qrmsg")) $("#qrmsg").textContent = "NapCat：" + r.error + "（点上面的「重新获取二维码」）";
    const show = r.status === "need_scan" || r.status === "scanned";
    if (show) {
      const img = $("#qr");
      const fresh = new Image();
      fresh.onload = () => { if ($("#qr") !== img || !$("#qrwait")) return; img.src = fresh.src; img.hidden = false; $("#qrwait").hidden = true; };
      fresh.src = `/api/qr?token=${encodeURIComponent(window.TOKEN)}&t=${Date.now()}`;
    } else {
      $("#qr").hidden = true;
      $("#qrwait").hidden = r.status === "online";
    }
    if (r.status === "online") onOnline();
  };
  tick();
  S.timers.push(setInterval(tick, 3000));
}

function pageQR() {
  S.page = 4;
  shell(4, "扫码登录小号", "用<b>小号</b>扫，不是你自己的大号。扫完在手机上确认。", qrBlock(), "");
  bindRefreshQR();
  let done = false;
  pollLogin(() => {
    if (done) return;
    done = true;
    clearTimers();
    pollProgress();
    setTimeout(pageDone, 800);
  });
}

// 状态页里的重新扫码：登录好了就回主页，不像安装时往下走
function pageRescan() {
  S.view = "connection";
  clearTimers();
  S.page = -1;
  shell(-1, "扫码登录小号", "用<b>小号</b>扫，不是你自己的大号。扫完在手机上确认。", qrBlock(),
    `<button id="back">返回</button><span></span>`);
  $("#back").onclick = pageStatus;
  bindRefreshQR();
  let done = false;
  pollLogin(() => {
    if (done) return;
    done = true;
    clearTimers();
    setTimeout(pageStatus, 800);
  });
}

// ---------------- 第 6 页：完成 ----------------
async function pageDone() {
  clearTimers();
  S.page = 5;
  shell(5, "你的工作区，准备好了", "初始化完成后，日常打开织灵会直接进入工作台。", `
    <div class="complete-mark">✓</div><div class="complete-copy"><h2>欢迎来到织灵</h2><p>${esc(S.info.profile?.name || "你的角色")}的设定已保存。接下来可以检查运行状态、管理账号和启用 Agent 任务。</p></div>
    <div class="note">桌面入口为「启动织灵」。电脑重启后由程序重新检查服务；有效的账号登录状态会继续使用。</div><div id="finish-msg" class="msg" role="status">正在确认最后的初始化步骤…</div>`,
    `<span class="quiet">下一次，从工作台继续。</span><button class="primary" id="fin" disabled>进入工作台 ${icon("arrow")}</button>`);
  $("#fin").onclick = async () => {
    $("#fin").disabled = true;
    const r = await api("/api/finish", {});
    if (!r.ok) { $("#finish-msg").textContent = r.message; $("#fin").disabled = false; return; }
    S.info = await api("/api/info");
    S.mode = S.info.mode;
    pageStatus();
  };
  const tick = async () => {
    const p = await api("/api/progress");
    if (!$("#finish-msg")) return;
    $("#fin").disabled = !p.finished;
    $("#finish-msg").textContent = p.finished ? "初始化已完成，可以进入工作台。" : "正在确认最后的初始化步骤…";
  };
  await tick(); S.timers.push(setInterval(tick, 1500));
}

// ---------------- 状态页（桌面快捷方式打开的） ----------------
async function pageStatus() {
  clearTimers(); S.page = -1; S.view = "overview";
  const profile = S.info.profile || {};
  const name = profile.name || "你的角色";
  shell(-1, "运行概览", "在这里继续角色的日常，查看连接与服务状态。", `
    <section class="workspace-hero"><div class="hero-copy"><span class="hero-label"><i></i> 当前角色</span><h2>${esc(name)}<span>的日常，正在这里延续。</span></h2><div class="hero-state"><span class="dot wait" id="sdot"></span><span id="stext" role="status">正在读取真实运行状态…</span></div><div class="acts"><button class="primary" id="up">${icon("play")} 一键联动</button><button class="secondary" id="down">停止服务</button></div></div><div class="hero-emblem"><img src="/img/logo.png" alt=""><span>ZhiLing / 本机工作区</span></div></section>
    <div id="serr" class="msg bad" role="alert"></div>
    <section class="service-grid" aria-label="服务状态"><article class="service-card"><span class="service-glyph">${icon("person")}</span><div><h3>角色服务</h3><p>会话与能力组件</p></div><span class="state-tag" id="service-role">检查中</span></article><article class="service-card"><span class="service-glyph">${icon("link")}</span><div><h3>QQ 通道</h3><p id="connection-account">账号与消息连接</p></div><span class="state-tag" id="service-qq">检查中</span></article><article class="service-card"><span class="service-glyph">${icon("spark")}</span><div><h3>Agent 引擎</h3><p>任务与工具执行</p></div><span class="state-tag" id="service-agent">检查中</span></article></section>
    <div class="content-grid"><section class="panel role-preview"><div class="panel-heading"><div><span class="eyebrow">由你定义</span><h2>角色档案</h2></div><button class="text-button" id="edit-prof">编辑设定 ${icon("arrow")}</button></div><div class="role-identity"><div class="role-initial">${esc([...name][0] || "角")}</div><div><h3>${esc(name)}</h3><span>当前本机角色</span></div></div><p class="persona-excerpt">${esc(profile.persona || "还没有填写角色设定，可以进入编辑页面完善。")}</p><div class="role-foot"><span>人格 · 声音 · 表情</span><button id="edit-keys" class="text-button">模型与服务 ${icon("arrow")}</button></div></section>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">保持连接</span><h2>今天的工作区</h2></div></div><button class="shortcut-row" id="open-connection"><span class="shortcut-icon">${icon("link")}</span><span><strong>账号连接</strong><small>查看登录状态与重新扫码</small></span>${icon("arrow")}</button><button class="shortcut-row" id="agent-settings"><span class="shortcut-icon">${icon("spark")}</span><span><strong>Agent 任务</strong><small>部署引擎、检查桥接与任务通道</small></span>${icon("arrow")}</button><button class="shortcut-row" id="open-settings"><span class="shortcut-icon">${icon("settings")}</span><span><strong>设置与维护</strong><small>控制台入口、账号切换与退出</small></span>${icon("arrow")}</button></section></div>
    <section class="panel activity-panel"><div class="panel-heading"><h2>本次联动</h2><span class="quiet">仅显示实际服务检查</span></div><div id="startup-events" class="empty-inline">尚无本次联动记录。</div></section>
    <div id="sqr" class="panel" hidden><h2>账号需要重新登录</h2>${qrBlock()}</div>`, "");
  $("#edit-prof").onclick = pageProfile; $("#edit-keys").onclick = pageKeys;
  $("#agent-settings").onclick = pageAgent; $("#open-settings").onclick = pageSettings; $("#open-connection").onclick = pageConnections;
  $("#up").onclick = async () => { const r = await api("/api/start", {}); if (!r.ok) $("#serr").textContent = r.message; else await tick(); };
  $("#down").onclick = async () => { const r = await api("/api/stop", {}); if (!r.ok) $("#serr").textContent = r.message; else await tick(); };
  let polling = false, qrPolling = false, last;
  const tag = (id, label, state) => { const node = $(id); node.textContent = label; node.className = "state-tag " + state; };
  const tick = async () => {
    if (polling) return; polling = true;
    try {
      const [s, a] = await Promise.all([api("/api/status"), api("/api/agent")]);
      if (!$("#stext")) return;
      if (typeof s.astrbot !== "boolean") { $("#serr").textContent = s.message || "无法读取服务状态"; return; }
      last = s;
      const running = s.astrbot && s.napcat;
      const online = running && s.login === "online";
      $("#stext").textContent = s.starting ? "正在联动服务…" : online ? "角色已连接，可以开始交流" : running ? "服务已启动，等待账号连接" : "服务未运行，随时可以继续";
      $("#sdot").className = "dot " + (online ? "on" : s.starting || running ? "wait" : "off");
      $("#serr").textContent = s.error || "";
      tag("#service-role", s.astrbot ? "运行中" : "未运行", s.astrbot ? "online" : "idle");
      tag("#service-qq", online ? "已连接" : s.napcat ? "待登录" : "未运行", online ? "online" : s.napcat ? "pending" : "idle");
      tag("#service-agent", a.busy ? "准备中" : a.ready ? "已就绪" : a.installed ? "未就绪" : typeof a.installed === "boolean" ? "未部署" : "未知", a.ready ? "online" : "idle");
      $("#connection-account").textContent = s.qq ? "当前账号 · " + s.qq : "账号与消息连接";
      $("#up").disabled = !!s.starting || !!s.agent_preparing;
      $("#down").disabled = (!s.astrbot && !s.napcat) || !!s.agent_preparing;
      $("#startup-events").innerHTML = s.steps?.length ? s.steps.map(step=>`<div class="event-row"><span class="event-dot ${esc(step.status)}"></span><span>${esc(step.title)}</span><small>${esc(step.message || ({done:"已完成",doing:"正在检查",error:"需要处理",todo:"等待检查"}[step.status] || step.status))}</small></div>`).join("") : "尚无本次联动记录。点击一键联动后查看各项检查。";
      const needQR = running && ["need_scan", "scanned", "error"].includes(s.login);
      $("#sqr").hidden = !needQR;
      if (needQR && !qrPolling) { qrPolling = true; bindRefreshQR(); pollLogin(()=>{}); }
    } finally { polling = false; }
  };
  await tick(); S.timers.push(setInterval(tick,3000));
  if (last && !last.astrbot && !last.napcat && !last.starting && !last.agent_preparing && $("#stext")) {
    const r = await api("/api/start", {}); if (!r.ok) $("#serr").textContent = r.message; else await tick();
  }
}

async function pageConnections() {
  clearTimers(); S.view = "connection"; S.page = -1;
  const s = await api("/api/status");
  shell(-1, "账号连接", "管理角色用于交流的账号，登录状态由协议端实际检查。", `
    <section class="panel connection-panel"><div class="panel-heading"><div class="account-title"><span class="account-logo">QQ</span><div><h2>QQ 通道</h2><span class="quiet">当前使用 NapCat</span></div></div><span class="state-tag ${s.login === 'online' && s.napcat ? 'online' : 'pending'}">${s.login === 'online' && s.napcat ? '已连接' : '等待连接'}</span></div><p>${s.qq ? '当前账号：' + esc(s.qq) : '连接独立 QQ 小号后，角色可以接收消息并回复。'}</p><div class="acts"><button class="primary" id="connection-check">${s.astrbot && s.napcat ? '检查登录 / 重新扫码' : '启动并连接'}</button><button id="connection-manage">账号管理</button></div></section><div id="connection-error" class="msg bad" role="alert"></div>`, `<button id="back">返回工作台</button>`);
  $("#back").onclick = pageStatus; $("#connection-manage").onclick = pageSettings;
  $("#connection-check").onclick = async () => { const r = await api("/api/start", {}); if (!r.ok) $("#connection-error").textContent = r.message; else pageRescan(); };
}

async function pageSettings() {
  clearTimers(); S.view = "settings"; S.page = -1;
  shell(-1, "设置与维护", "日常设置与维护操作集中在这里，角色资料由你保留。", `
    <section class="panel"><div class="panel-heading"><h2>控制台</h2><span class="quiet">高级管理入口</span></div><div class="settings-row"><div><strong>角色与能力控制台</strong><p>查看会话、插件与引擎配置。</p></div><a class="button-link" id="dashboard-console" target="_blank" rel="noopener" hidden>打开控制台 ${icon("arrow")}</a></div><div class="settings-row"><div><strong>QQ 通道控制台</strong><p>查看协议端、连接和账号状态。</p></div><a class="button-link" id="qq-console" target="_blank" rel="noopener" hidden>打开控制台 ${icon("arrow")}</a></div><details class="help"><summary>查看控制台登录凭据</summary><button id="reveal-credentials">显示管理凭据</button><dl id="credentials" class="info" hidden></dl><p>仅在自己电脑上查看，不要公开截图或分享凭据。</p></details></section>
    <section class="panel"><div class="panel-heading"><h2>账号与运行</h2></div><div class="settings-row"><div><strong>切换 QQ 账号</strong><p>退出当前小号并重新扫码，角色资料会保留。</p></div><button id="switch-qq">切换账号</button></div><div class="settings-row"><div><strong>停止服务并退出</strong><p>暂停角色与任务服务，下次打开可以重新联动。</p></div><button id="quit">停止并退出</button></div></section>
    <details class="panel danger-zone"><summary>卸载与数据移除</summary><p>卸载会删除安装目录中的角色资料和记录，请先自行备份重要内容。</p><button class="danger-ghost" id="uninstall">卸载织灵</button></details><div id="serr" class="msg bad" role="alert"></div>`, "");
  bindMaintenance();
  const consoles = await api("/api/consoles");
  for (const [id, url] of [["#dashboard-console",consoles.dashboard_url],["#qq-console",consoles.napcat_url]]) {
    const node = $(id); if (node && /^http:\/\/127\.0\.0\.1:\d+$/.test(url || "")) { node.href = url; node.hidden = false; }
  }
  const reveal = $("#reveal-credentials");
  if (reveal) reveal.onclick = async () => { const r = await api("/api/done"); if (!$("#credentials")) return; $("#credentials").innerHTML = `<dt>账号</dt><dd>${esc(r.username)}</dd><dt>密码</dt><dd>${esc(r.password)}</dd>`; $("#credentials").hidden = false; };
}

function bindMaintenance() {
  $("#switch-qq").onclick = async () => {
    const yes = await confirmBox({
      title: "退出小号 / 换一个",
      body: `<p>当前这个小号会<b>退出登录</b>，不再是机器人，然后出一张新的二维码。</p>
        <div class="note">想换号就用另一个小号扫；不想再用了，出码后直接点「停止服务」就行。<br>
        这个小号在这台电脑上的登录数据会一起清掉，以后不会自己登回来。<br>
        名字、性格、聊天记录和表情包都留着。不会动你自己常用的那个 QQ。</div>`,
      ok: "退出登录",
    });
    if (!yes) return;
    const r = await api("/api/switch_qq", {});
    if (!r.ok) return ($("#serr").textContent = r.message);
    const started = await api("/api/start", {});
    if (!started.ok) return ($("#serr").textContent = started.message);
    pageRescan();
  };
  $("#quit").onclick = async () => {
    const yes = await confirmBox({
      title: "停止服务并退出",
      body: `<p>角色和任务服务都会停止。</p>
        <div class="note">什么都不会删。需要再次运行时，双击桌面的「启动织灵」。</div>`,
      ok: "停掉并退出",
    });
    if (!yes) return;
    const r = await api("/api/quit", {});
    if (!r.ok) return ($("#serr").textContent = r.message);
    shell(-1, "服务已停止", "已经全部停掉。", `
      <div class="note">需要再次运行时，双击桌面的「启动织灵」。这个窗口可以关了。</div>`,
      `<span></span><button class="primary" id="fin">关闭窗口</button>`);
    $("#fin").onclick = () => window.close();
  };
  $("#uninstall").onclick = async () => {
    const yes = await confirmBox({
      title: "彻底卸载",
      danger: true,
      need: "卸载",
      body: `<p>会删掉下面这些，<b>删了找不回来</b>：</p>
        <ul class="bullets">
          <li>安装目录 <code>${esc(S.info.root || "")}</code> 里的全部文件</li>
          <li>角色的聊天记忆、表情包、你填的 key</li>
          <li>桌面上的「启动织灵」图标</li>
          <li>小号的登录状态和它在这台电脑上的聊天数据</li>
        </ul>
        <div class="note">不装注册表、不设环境变量、不加开机自启，所以删完就真没了。<br>
        不会动你电脑上的 QQ 软件，也不会动你自己常用那个号的聊天记录。<br>
        只是暂时不用的话，点上一个「停止服务并退出」就够了。</div>`,
      ok: "我确定，卸载",
    });
    if (!yes) return;
    clearTimers();
    const r = await api("/api/uninstall", {});
    shell(-1, r.ok ? "已经卸载了" : "卸载没成功", r.ok ? "卸载流程已开始。" : "", r.ok ? `
      <div class="note">文件会在几秒内删干净。关掉这个窗口就行。<br>
      想再装回来，重新打开织灵安装程序。</div>` : `<div class="msg bad" style="white-space:pre-wrap">${esc(r.message || "")}</div>`,
      `<span></span><button class="primary" id="fin">关闭窗口</button>`);
    $("#fin").onclick = () => window.close();
  };
}

// 改完设置：原地等重启，不要把人甩回安装向导
async function applySettings() {
  clearTimers();
  S.page = -1;
  shell(-1, "正在应用改动", "在更新配置并重新联动服务。大概一两分钟，别关窗口。", `
    <ul class="tasks" id="tasks"></ul>
    <div class="note">改完会自己回到主页。登录没失效就不用再扫码。</div>
    <div id="msg" class="msg bad" role="alert"></div>`,
    `<span></span><button class="primary" id="retry" hidden>重试</button>`);
  $("#retry").onclick = async () => { await api("/api/retry", {}); $("#retry").hidden = true; };
  const applied = await api("/api/apply", {});
  if (!applied.ok) { $("#msg").textContent = applied.message; return; }
  const tick = async () => {
    S.progress = await api("/api/progress");
    if (!$("#tasks")) return;
    renderApplying();
    if (S.progress.finished) return clearTimers(), pageStatus();
    // 改完 key 后登录可能失效。只有真的要扫码才跳过去：登录还在的话这一步瞬间就过了，
    // 光看 status === "doing" 会白闪一下二维码页
    const login = S.progress.steps.find((s) => s.key === "login");
    if (login && login.status === "doing") {
      const l = await api("/api/login");
      if (["need_scan", "scanned", "error"].includes(l.status)) { clearTimers(); pageRescan(); }
    }
  };
  tick();
  S.timers.push(setInterval(tick, 1500));
}

function renderApplying() {
  const p = S.progress;
  const ul = $("#tasks");
  if (!ul || !p) return;
  // 只列这次重跑的几步，解压之类早就做完的不用再刷一遍
  const keys = ["configs", "astrbot", "napcat", "import", "agent", "login"];
  ul.innerHTML = p.steps.filter((s) => keys.includes(s.key)).map((s) => `
    <li class="${s.status}"><span class="ic">${ICON[s.status]}</span><div>${esc(s.title)}
      ${s.status === "error" ? `<div class="t-msg" style="white-space:pre-wrap">${esc(s.message)}</div>` : ""}
    </div></li>`).join("");
  $("#retry").hidden = !p.steps.some((s) => s.status === "error");
}

// ---------------- Agent 任务 ----------------
async function pageAgent() {
  S.view = "agent";
  clearTimers();
  S.page = -2;
  shell(-1, "Agent 任务", "日常聊天保留角色表达；需要执行任务时，通过 /dsh 交给 Agent。", `
    <div class="note">首次部署会下载独立运行环境和任务组件，并重启消息服务。仅主人可使用，普通聊天用户不会获得电脑操作权限。工作目录是任务文件位置，不是系统沙箱。</div>
    <p id="agent-state" role="status">正在检查…</p>
    <div id="agent-error" class="msg bad" role="alert"></div>
    <div class="acts">
      <button class="primary" id="agent-prepare">安装并启用</button>
      <button id="agent-start">重新联动</button>
      <button id="agent-stop">暂停任务服务</button>
    </div>
    <p><a id="agent-console" target="_blank" rel="noopener" hidden>打开 Agent 控制台</a></p>
    <details class="note"><summary>任务与审批</summary>
      <p>发 <code>/dsh 任务内容</code>，结果回到原消息通道。授权和提问保持确认流程，不自动代答。发 <code>/dsh stop</code> 可停止当前任务。</p>
      <p>任务文件保存在安装目录的 agent-workspace。桥接只监听本机；认证缓存由运行组件保存，不要公开 engines 目录和日志。</p>
    </details>`, `<button id="agent-back">返回</button>`);
  const tick = async () => {
    const r = await api("/api/agent");
    if (!$("#agent-state")) return;
    $("#agent-state").textContent = r.busy ? "正在准备 Agent，请稍候…" : r.message || "检查失败";
    $("#agent-error").textContent = r.error || "";
    ["prepare", "start", "stop"].forEach(x => $("#agent-" + x).disabled = !!r.busy);
    $("#agent-prepare").textContent = r.installed ? "修复并启用" : "安装并启用";
    $("#agent-start").disabled = !!r.busy || !r.installed;
    $("#agent-stop").disabled = !!r.busy || !r.ready;
    const link = $("#agent-console");
    link.hidden = !r.ready;
    if (r.ready && /^http:\/\/127\.0\.0\.1:\d+$/.test(r.console_url)) link.href = r.console_url;
  };
  for (const action of ["prepare", "start", "stop"]) {
    $("#agent-" + action).onclick = async () => {
      const r = await api("/api/agent", {action});
      if (!r.ok) $("#agent-error").textContent = r.message;
      else await tick();
    };
  }
  $("#agent-back").onclick = pageStatus;
  await tick();
  S.timers.push(setInterval(tick, 3000));
}

// ---------------- 入口 ----------------
(async () => {
  S.info = await api("/api/info");
  if (!S.info || !S.info.mode) {
    $("#app").innerHTML = `<div class="empty-screen"><main class="main"><h1>暂时无法打开工作区</h1><p class="sub" style="white-space:pre-wrap">${esc(S.info?.message || "打不开安装程序")}</p></main></div>`;
    return;
  }
  S.mode = S.info.mode;
  if (S.mode === "status") pageStatus();
  else pagePath();
})();
