#!/usr/bin/env node
// 对谈稿 → 双人播客 MP3（逐句合成，默认用 MiniMax，也可换豆包、ElevenLabs，见 tts-providers.mjs）。做法沿用 natural-voice-dubbing：一句一合成、质检重跑、按停顿拼接。
// 用法：node podcast-tts.mjs <这一期的文件夹> [--plan] [--no-asr] [--script 对谈稿.md] [--voice 预设名]
//   --voice   换一套声音，预设在 voices.json 的 presets 里（如 本人 / 播音员 / 电台 / 高管）
//   --plan    只拆句、算字数和预计时长，不调用 MiniMax（不花钱）
//   --send    做完后按用户配置里的 send 命令把 MP3 发出去（比如发到飞书、Telegram）
//   --no-asr  跳过本机语音识别复查（快，但读错的句子发现不了）
//   文件夹里要有 对谈稿.md，每行一个话轮：「女：……」「男：……」；方括号里可写情绪和抢话「女[surprised,抢]：……」；「## 小标题」表示话题切换。
//   句子里可以用 MiniMax 的声音标记 (chuckle) (laughs) (breath) (emm) (sighs) 等和停顿标记 <#0.2#>。
// 配置从低到高：本 Skill 的 voices.json（公开默认）< 用户配置 ~/.config/podcast-maker/config.json（个人，可用环境变量 PODCAST_MAKER_HOME 改目录）
//   < 这一期文件夹里的 voices.json < --voice 预设。
// 可选：发音.txt（每行一条「原文/(读法)」，只对 MiniMax 有效）。
// 产出：<标题>.mp3、.配音/报告.md；每句的音频缓存在 .配音/takes，改了哪句只重配哪句。
// 密钥：环境变量，或 .env 文件（默认 ~/.config/podcast-maker/.env，可在 config.json 的 env_file 里改）。
//   MiniMax：MINIMAX_API_KEY（可选 MINIMAX_API_HOST）；豆包：DOUBAO_APPID、DOUBAO_ACCESS_TOKEN；ElevenLabs：ELEVENLABS_API_KEY。
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { PROVIDERS, KEYS, DEFAULTS } from "./tts-providers.mjs";

const HOME = os.homedir(), SKILL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2), flag = (f) => argv.includes(f);
const optVal = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null);
const DIR = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--script" && argv[i - 1] !== "--voice");
if (!DIR || !existsSync(DIR)) { console.error("用法：node podcast-tts.mjs <这一期的文件夹> [--plan] [--no-asr]"); process.exit(1); }
const SCRIPT = optVal("--script") || path.join(DIR, "对谈稿.md");
if (!existsSync(SCRIPT)) { console.error("找不到对谈稿：" + SCRIPT); process.exit(1); }

const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
const USER_DIR = (process.env.PODCAST_MAKER_HOME || path.join(HOME, ".config", "podcast-maker")).replace(/^~(?=\/)/, HOME);
const LOCAL = { ...readJson(path.join(SKILL, "config.local.json")), ...readJson(path.join(USER_DIR, "config.json")) }; // 兼容旧位置
const layers = [readJson(path.join(SKILL, "voices.json")), LOCAL, readJson(path.join(DIR, "voices.json"))];
const presets = Object.assign({}, ...layers.map((l) => l.presets || {})), PRESET = optVal("--voice");
if (PRESET && !presets[PRESET]) { console.error(`没有「${PRESET}」这个声音预设，可选：${Object.keys(presets).join("、")}`); process.exit(1); }
const pre = PRESET ? presets[PRESET] : {};
const SPEAKERS = {}; // 预设里除了 provider 以外的键都是说话人
for (const l of [...layers.map((x) => x.speakers || {}), Object.fromEntries(Object.entries(pre).filter(([k]) => k !== "provider"))]) for (const [k, v] of Object.entries(l)) SPEAKERS[k] = { ...(SPEAKERS[k] || {}), ...v };
const LABELS = Object.keys(SPEAKERS);
if (LABELS.length < 1) { console.error("voices.json 里没有说话人"); process.exit(1); }
const PROVIDER = pre.provider || [...layers].reverse().map((l) => l.provider).find(Boolean) || "minimax";
const PCFG = {}; // 每家服务商的设置：默认值 < 各层 providers
for (const name of Object.keys(PROVIDERS)) PCFG[name] = Object.assign({}, DEFAULTS[name], ...layers.map((l) => (l.providers || {})[name] || {}));
if (layers[0].model && !(layers[0].providers || {}).minimax?.model) PCFG.minimax.model = layers[0].model; // 兼容旧写法
for (const k of LABELS) { SPEAKERS[k].provider ||= PROVIDER; if (!PROVIDERS[SPEAKERS[k].provider]) { console.error(`不认识的语音服务商「${SPEAKERS[k].provider}」，可选：${Object.keys(PROVIDERS).join("、")}`); process.exit(1); } }
const envFile = (LOCAL.env_file || path.join(USER_DIR, ".env")).replace(/^~(?=\/)/, HOME);
const env = { ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, "utf8").split("\n").map((l) => /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*?)"?\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2]])) : {}), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(MINIMAX|DOUBAO|ELEVENLABS)_/.test(k))) };
const MODEL = [...new Set(LABELS.map((k) => { const p = SPEAKERS[k].provider; return p === "minimax" ? PCFG.minimax.model : `${p}${PCFG[p].model ? " " + PCFG[p].model : ""}`; }))].join(" + ");
const SR = 44100, EMOTIONS = ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "calm"];
const SOUND_TAGS = ["laughs", "chuckle", "coughs", "clear-throat", "groans", "breath", "pant", "inhale", "exhale", "gasps", "sniffs", "sighs", "snorts", "burps", "lip-smacking", "humming", "hissing", "emm", "sneezes"];
const CPM = 250; // 估算时长用：每分钟大约念多少字

const FFMPEG = [ "ffmpeg", path.join(HOME, ".local", "bin", "ffmpeg"), "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg" ].find((c) => spawnSync(c, ["-version"]).status === 0);
const ff = (args) => spawnSync(FFMPEG, ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------- 文字工具 ----------
const bare = (t) => String(t).replace(/<#[\d.]+#>/g, "").replace(/\([a-z]+\)/gi, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const count = (t) => (bare(t).match(/[一-鿿]|[a-z]+|\d+/g) || []).length; // 汉字按字，英文按词
// 数字统一成中文读法，再比较：「17」和「十七」、「1600」和「一千六百」、「2026年」和「二零二六年」算一样；「两」当「二」
const ZD = "零一二三四五六七八九";
const four = (n) => { let s = "", z = false; for (const [u, v] of [[1000, "千"], [100, "百"], [10, "十"], [1, ""]]) { const d = Math.floor(n / u) % 10; if (d) { if (z) s += "零"; s += ZD[d] + v; z = false; } else if (s) z = true; } return s; };
const zhInt = (s) => { s = s.replace(/^0+(?=\d)/, ""); if (s.length > 8) return [...s].map((d) => ZD[d]).join(""); const n = +s; if (!n) return "零";
  const hi = Math.floor(n / 1e4), lo = n % 1e4; return (hi ? four(hi) + "万" + (lo ? (lo < 1000 ? "零" : "") + four(lo) : "") : four(lo)).replace(/^一十/, "十"); };
const numZh = (t) => String(t).replace(/(\d),(?=\d{3})/g, "$1").replace(/(\d+)(?:\.(\d+))?\s*([%％])?/g, (m, a, b, pct, off, s) => {
  const year = !b && !pct && a.length === 4 && /^\s*年/.test(s.slice(off + m.length));
  let z = year ? [...a].map((d) => ZD[d]).join("") : zhInt(a); if (b) z += "点" + [...b].map((d) => ZD[d]).join("");
  return pct ? "百分之" + z : z; }).replace(/〇/g, "零").replace(/两/g, "二");
const norm = (t) => bare(numZh(t));
function similar(a, b) {
  a = norm(a); b = norm(b); if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) { const cur = [0]; for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
  return prev[b.length] / Math.max(a.length, b.length);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- 1. 读对谈稿：话轮 → 配音单元 ----------
function parse(md) {
  const re = new RegExp(`^\\s*(?:[-*]\\s+)?\\**\\s*(${LABELS.map(esc).join("|")})\\s*\\**\\s*(?:[\\[〔【]([^\\]〕】]*)[\\]〕】])?\\s*\\**\\s*[:：]\\s*\\**\\s*(.+)$`);
  const turns = [], sections = []; let title = "", skipped = 0;
  for (const line of md.replace(/\r/g, "").split("\n")) {
    const h = /^\s*(#{1,6})\s+(.+)$/.exec(line);
    if (h) { if (h[1].length === 1 && !title) title = h[2].trim(); else sections.push({ name: h[2].trim(), from: turns.length }); if (turns.length) turns[turns.length - 1].sectionEnd = true; continue; }
    // 单独一行「[停 6 秒]」：在上一句后面留白（给听众自己想答案）
    const ps = /^\s*[\[【〔]\s*(?:停顿?|留白)\s*(\d+(?:\.\d+)?)\s*秒?\s*[\]】〕]\s*$/.exec(line);
    if (ps) { if (turns.length) turns[turns.length - 1].extraPause = Math.min(20, +ps[1]); continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { if (turns.length) turns[turns.length - 1].sectionEnd = true; continue; }
    const m = re.exec(line);
    if (m) {
      const text = m[3].replace(/[*_`]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/（[^（）]*）/g, "") // 全角括号里的是给人看的提示，不念
        .replace(/\(([a-z-]+)\)/gi, (x, w) => (SOUND_TAGS.includes(w.toLowerCase()) ? `(${w.toLowerCase()})` : "")).trim(); // 只保留 MiniMax 认识的声音标记
      const tags = (m[2] || "").split(/[\s,，、]+/).filter(Boolean);
      // 抢：在上一个人话音未落时切进来；快：紧接着说，几乎不留空
      const overlap = tags.some((t) => /^(抢|抢话|interrupt)$/.test(t)) ? 0.38 : tags.some((t) => /^(快|接|overlap)$/.test(t)) ? 0.16 : 0;
      if (bare(text)) turns.push({ speaker: m[1], emotion: tags.find((t) => EMOTIONS.includes(t)) || "auto", overlap, text });
    } else if (line.trim() && !/^\s*(>|<!--)/.test(line)) skipped++;
  }
  return { title, turns, skipped, sections };
}
function splitTurn(text) {
  const sents = text.match(/[^。！？!?；;…]+[。！？!?；;…]*/g) || [text];
  const out = [];
  for (let s of sents) {
    s = s.trim(); if (!bare(s)) { if (out.length) out[out.length - 1].text += s; continue; }
    const pieces = count(s) > 60 ? (s.match(/[^，,]+[，,]?/g) || [s]).reduce((acc, p) => { if (acc.length && count(acc[acc.length - 1] + p) <= 40) acc[acc.length - 1] += p; else acc.push(p); return acc; }, []) : [s];
    pieces.forEach((p, k) => {
      const last = out[out.length - 1], n = count(p);
      // 很短的句子并到前一句，免得一句一顿
      if (last && !last.cut && k === 0 && count(last.text) + n <= 45 && (count(last.text) < 10 || n < 8)) last.text += p;
      else out.push({ text: p.trim(), cut: k < pieces.length - 1 });
      if (k < pieces.length - 1) out[out.length - 1].cut = true;
    });
  }
  return out;
}
function buildUnits(turns) {
  const us = [];
  turns.forEach((t, ti) => {
    const sp = SPEAKERS[t.speaker], next = turns[ti + 1], parts = splitTurn(t.text);
    parts.forEach((p, k) => {
      let pause;
      if (k < parts.length - 1) pause = p.cut ? 0.1 : /[？?]\s*$/.test(p.text) ? 0.3 : 0.2;
      else if (!next) pause = 0.6;
      else if (t.sectionEnd) pause = 0.75;                                  // 话题切换
      else if (next.speaker === t.speaker) pause = 0.3;
      else if (count(next.text) < 6 || count(t.text) < 6) pause = 0.2;      // 「对」「嗯，有意思」这类接话要快
      else pause = /[？?]\s*$/.test(p.text) ? 0.42 : 0.36;                  // 换人说话
      if (k === parts.length - 1 && t.extraPause) pause = t.extraPause;
      const u = { speaker: t.speaker, turn: ti + 1, text: p.text, emotion: t.emotion, voice_id: sp.voice_id, speed: sp.speed ?? 1, pitch: sp.pitch ?? 0, vol: sp.vol ?? 1, pause_after: pause,
        overlap: k === 0 && ti > 0 && turns[ti - 1].speaker !== t.speaker ? t.overlap : 0 };
      us.push(u);
    });
  });
  return us;
}

const { title, turns, skipped, sections } = parse(readFileSync(SCRIPT, "utf8"));
const us = buildUnits(turns);
if (!us.length) { console.error(`对谈稿里没有找到「${LABELS.join("：」「")}：」开头的行`); process.exit(1); }
const pronFile = path.join(DIR, "发音.txt");
const PRON = existsSync(pronFile) ? readFileSync(pronFile, "utf8").split("\n").map((l) => l.trim()).filter((l) => /^[^/]+\/\(.+\)$/.test(l)) : [];
for (const u of us) {
  u.pron = PRON.filter((p) => u.text.includes(p.split("/")[0]));
  u.provider = SPEAKERS[u.speaker].provider;
  const key = [u.voice_id, u.speed, u.pitch, u.vol, u.emotion, u.text, u.pron]; // MiniMax 沿用旧的缓存键，换服务商时缓存自然分开
  u.hash = createHash("sha1").update(JSON.stringify(u.provider === "minimax" ? [PCFG.minimax.model, ...key] : [u.provider, PCFG[u.provider].model || PCFG[u.provider].cluster || "", ...key])).digest("hex").slice(0, 16);
}
const NAME = (title || path.basename(path.resolve(DIR))).replace(/[\/\\:*?"<>|]/g, " ").trim().slice(0, 60) || "播客";
const work = path.join(DIR, ".配音"), takesDir = path.join(work, "takes"), cacheFile = path.join(work, "cache.json");
const cache = readJson(cacheFile);
for (const h of Object.keys(cache)) cache[h].takes = (cache[h].takes || []).filter((t) => existsSync(path.join(takesDir, t.file)));
const T = (u) => (cache[u.hash] ||= { takes: [] }).takes;
const jobs = [...new Map(us.map((u) => [u.hash, u])).values()];

const totalChars = us.reduce((a, u) => a + count(u.text), 0), todo = jobs.filter((u) => !T(u).length);
console.log(`《${NAME}》：${turns.length} 个话轮，拆成 ${us.length} 句，约 ${totalChars} 字，预计 ${(totalChars / CPM).toFixed(1)} 分钟`);
for (const l of LABELS) { const mine = us.filter((u) => u.speaker === l); console.log(`  ${l}（${SPEAKERS[l].role || ""} · ${SPEAKERS[l].provider === "minimax" ? "" : SPEAKERS[l].provider + " "}${SPEAKERS[l].voice_id}）：${mine.length} 句，${mine.reduce((a, u) => a + count(u.text), 0)} 字`); }
if (skipped) console.log(`  注意：有 ${skipped} 行没有说话人标记，不会念`);
console.log(`  需要新合成 ${todo.length} 句（约 ${todo.reduce((a, u) => a + count(u.text), 0)} 字），其余用缓存`);
// ---------- 稿子体检：只提示，不拦截 ----------
{
  const warn = [], tc = turns.map((t) => count(t.text)), mmss0 = (c) => { const sec = Math.round(c / CPM * 60); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  const share = LABELS.map((l) => [l, us.filter((u) => u.speaker === l).reduce((a, u) => a + count(u.text), 0) / (totalChars || 1)]);
  const top = share.slice().sort((a, b) => b[1] - a[1])[0];
  if (LABELS.length > 1 && top[1] > 0.65) warn.push(`${top[0]}说了 ${Math.round(top[1] * 100)}% 的字，像讲课。把一部分内容改成另一个人先猜、先说、复述（目标：不超过 65%）`);
  const long = turns.map((t, i) => [i, tc[i]]).filter((x) => x[1] > 110);
  if (long.length) warn.push(`${long.length} 个话轮超过 110 字，听着像独白：` + long.slice(0, 5).map(([i, n]) => `第 ${i + 1} 轮 ${turns[i].speaker}「${turns[i].text.slice(0, 12)}…」${n} 字`).join("；"));
  const cut = turns.filter((t) => t.overlap > 0.2).length, quick = turns.filter((t) => t.overlap > 0 && t.overlap <= 0.2).length;
  const tagN = turns.reduce((a, t) => a + (t.text.match(/\((?:[a-z-]+)\)/g) || []).length, 0), laughs = turns.reduce((a, t) => a + (t.text.match(/\(laughs\)/g) || []).length, 0);
  if (turns.length >= 30 && cut < 2) warn.push(`抢话只有 ${cut} 处，对话可能太顺（建议 2～5 处）`);
  if (cut > Math.max(5, turns.length / 25)) warn.push(`抢话 ${cut} 处，偏多`);
  if (turns.length >= 30 && tagN < turns.length / 9) warn.push(`声音标记只有 ${tagN} 个，偏少（大约每 5～8 个话轮一个）`);
  if (laughs > 4) warn.push(`(laughs) 有 ${laughs} 次，超过 4 次`);
  const stiff = {}; for (const t of turns) for (const w of t.text.match(/首先|其次|再次|综上|总而言之|众所周知|值得注意的是|本质是|由此可见|换言之/g) || []) stiff[w] = (stiff[w] || 0) + 1;
  if (Object.keys(stiff).length) warn.push("有讲稿腔的词：" + Object.entries(stiff).map(([w, n]) => `${w}×${n}`).join("、"));
  const meta = turns.reduce((n, t) => n + (t.text.match(/精讲稿|书里说|文章里说|原文说|需要说明的是|当然这也不/g) || []).length, 0);
  if (meta > 4) warn.push(`「精讲稿、书里说、需要说明的是」这类话出现 ${meta} 次，解释和交代太多（来源开场说一次就行，限定只留关键的）`);
  const quiz = turns.filter((t) => t.extraPause >= 4).length;
  if (totalChars > 1500 && !quiz) warn.push("没有自测留白（结尾可以提 2～3 个问题，每个后面写一行 [停 6 秒]）");
  let run = 0, maxRun = 0, runAt = 0; // 连续几个话轮里同一个人一直在长篇讲，另一个人只有很短的接话
  turns.forEach((t, i) => { if (tc[i] >= 40) { const who = t.speaker; let j = i, n = 0; while (j < turns.length && (turns[j].speaker === who || tc[j] < 8)) { if (turns[j].speaker === who) n += tc[j]; j++; } if (n > maxRun) { maxRun = n; runAt = i; } } });
  if (maxRun > 260) warn.push(`从第 ${runAt + 1} 轮起，${turns[runAt].speaker}连续讲了约 ${maxRun} 字，对方只有很短的接话，中间加一次追问或复述`);
  // 听众默认是外行：行话和英文词太多会听不懂
  const all = turns.map((t) => t.text.replace(/\([a-z-]+\)/gi, "")).join("\n");
  const jargon = {}; for (const w of all.match(/赋能|抓手|闭环|颗粒度|底层逻辑|范式|链路|对齐|心智|痛点|打通|沉淀|落地|维度|生态位|方法论|护城河|降本增效/g) || []) jargon[w] = (jargon[w] || 0) + 1;
  if (Object.keys(jargon).length) warn.push("有行话（听众默认不是专业人士，换成具体说法）：" + Object.entries(jargon).map(([w, n]) => `${w}×${n}`).join("、"));
  const eng = [...new Set((all.match(/[A-Za-z][A-Za-z0-9.+-]*[A-Za-z0-9+]|[A-Za-z]/g) || []).filter((w) => w.length > 1 || /[A-Z]/.test(w)))];
  if (eng.length > 8) warn.push(`英文词和缩写有 ${eng.length} 个（${eng.slice(0, 12).join("、")}${eng.length > 12 ? "…" : ""}）：能用中文说的就换掉，留下的第一次出现时先说中文意思`);
  // 外文原文要先有译文
  for (const f of readdirSync(DIR).filter((x) => /^原文(-\d+)?\.md$/.test(x))) { // 多篇合一期时是 原文-1.md、原文-2.md……
    const lang = (/^>\s*语言：(.+)$/m.exec(readFileSync(path.join(DIR, f), "utf8").slice(0, 800)) || [])[1], tr = f.replace("原文", "译文");
    if (lang && !existsSync(path.join(DIR, tr))) warn.push(`${f} 是${lang.trim()}，但文件夹里没有 ${tr}：先全文翻成中文，再以译文为底稿写稿（见 references/输入源.md「外文材料」）`);
  }
  // 精讲稿里用【】标的关键信息，对谈稿里都要讲到
  const brief = path.join(DIR, "精讲稿.md");
  if (existsSync(brief)) {
    const b = readFileSync(brief, "utf8"), marks = [...new Set([...b.matchAll(/【([^【】\n]{1,30})】/g)].map((m) => m[1].trim()).filter(Boolean))];
    const said = norm(all), miss = marks.filter((k) => !k.split(/[\/／|]/).some((alt) => norm(alt) && said.includes(norm(alt))));
    const hz = (b.replace(/^>.*$/gm, "").match(/[一-鿿]/g) || []).length;
    console.log(`  精讲稿：约 ${hz} 个汉字，【】标了 ${marks.length} 处关键信息` + (marks.length ? `，对谈里讲到 ${marks.length - miss.length} 处` : ""));
    if (!marks.length) warn.push("精讲稿里没有用【】标出必须讲到的关键信息（关键观点、数字、人物、日期），体检没法检查有没有漏");
    if (miss.length) warn.push(`精讲稿里标的这些，对谈稿里没出现：${miss.map((k) => `【${k}】`).join("")}。补进对谈稿；如果换了说法，把【】里改成对谈里的说法，或用 / 加上`);
  }
  console.log("  各段时长：" + (sections.length ? sections.map((sec, i) => { const to = sections[i + 1] ? sections[i + 1].from : turns.length; return `${sec.name} ${mmss0(tc.slice(sec.from, to).reduce((a, b) => a + b, 0))}`; }).join(" · ") : "（没有小标题）"));
  console.log(`  互动：抢话 ${cut}，快接 ${quick}，声音标记 ${tagN}（其中笑声 ${laughs}），自测留白 ${quiz}`);
  console.log(warn.length ? "  稿子体检，建议先改再配音：\n" + warn.map((w) => "    · " + w).join("\n") : "  稿子体检：没发现问题");
}
if (flag("--plan")) process.exit(0);
for (const p of new Set(us.map((u) => u.provider))) { const miss = KEYS[p].filter((k) => !env[k]); if (miss.length) { console.error(`缺少 ${miss.join("、")}（设成环境变量，或写进 ${envFile}）`); process.exit(1); } }
if (!FFMPEG) { console.error("找不到 ffmpeg"); process.exit(1); }
mkdirSync(takesDir, { recursive: true });
const saveCache = () => writeFileSync(cacheFile, JSON.stringify(cache));

// ---------- 2. 合成一句 ----------
let chars = 0, made = 0; const nextSlot = {}; // 各家都有每分钟请求数限制：同一家的请求之间至少隔 min_interval_ms
async function slot(p) { const now = Date.now(), at = Math.max(now, nextSlot[p] || 0); nextSlot[p] = at + (PCFG[p].min_interval_ms ?? 1000); if (at > now) await sleep(at - now); }
async function synth(u, file) {
  for (let i = 0; i < 8; i++) {
    await slot(u.provider);
    const r = await PROVIDERS[u.provider](u, PCFG[u.provider], env, i);
    if (r.audio) { writeFileSync(file, r.audio); return r.chars; }
    if (i === 7 || r.fatal) throw new Error(`${r.error}（第 ${u.turn} 个话轮：${u.text.slice(0, 20)}）`);
    await sleep((r.slow ? 8000 : 2000) * (i + 1));
  }
}

// ---------- 3. 质检 ----------
function measure(raw, trimmed) {
  ff(["-y", "-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,afade=t=in:d=0.008,areverse,afade=t=in:d=0.015,areverse", "-ar", String(SR), "-ac", "1", "-c:a", "pcm_s16le", trimmed]);
  const d = ff(["-i", trimmed, "-af", "silencedetect=n=-42dB:d=0.75,volumedetect", "-f", "null", "-"]).stderr;
  const dur = Number((/Duration: (\d+):(\d+):([\d.]+)/.exec(d) || []).slice(1).reduce((a, x, i) => a + x * [3600, 60, 1][i], 0)) || 0;
  const gaps = [...d.matchAll(/silence_duration: ([\d.]+)/g)].map((m) => +m[1]);
  // 削波：数被削平的采样点（连续顶在最大值附近），而不是只看峰值——有的克隆声音本来就很响，峰值常到 0 dB
  let clipped = 0; try { const b = wavData(trimmed); for (let i = 0, run = 0; i + 1 < b.length; i += 2) { const v = Math.abs(b.readInt16LE(i)); if (v >= 32600) { if (++run >= 3) clipped++; } else run = 0; } } catch {}
  return { dur, maxGap: gaps.length ? Math.max(...gaps) : 0, peak: +(/max_volume: (-?[\d.]+) dB/.exec(d) || [0, 0])[1], clipped };
}
async function make(u) {
  const v = T(u).length + 1, rawF = path.join(takesDir, `${u.hash}-v${v}.src`), cut = path.join(takesDir, `${u.hash}-v${v}.wav`);
  chars += await synth(u, rawF);
  const q = measure(rawF, cut); rmSync(rawF, { force: true });
  T(u).push({ file: path.basename(cut), ...q, rate: q.dur > 0 ? count(u.text) / (q.dur * u.speed) : 0 }); saveCache();
  if (++made % 10 === 0) console.log(`  已合成 ${made} 句…`);
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } })); }

function findWhisper() {
  for (const c of ["mlx_whisper", "/opt/homebrew/bin/mlx_whisper", "/usr/local/bin/mlx_whisper"]) if (spawnSync(c, ["--help"], { encoding: "utf8" }).status === 0) return c;
  const b = path.join(HOME, "Library", "Python"); if (!existsSync(b)) return null;
  for (const v of readdirSync(b)) { const f = path.join(b, v, "bin", "mlx_whisper"); if (existsSync(f)) return f; }
  return null;
}
function listen(files) { // 一个进程里逐句听写，模型只加载一次
  const w = findWhisper(); if (!w || !files.length) return null;
  let py = "python3"; try { const sb = readFileSync(w, "utf8").split("\n")[0]; if (sb.startsWith("#!")) py = sb.slice(2).trim().split(/\s+/)[0]; } catch {}
  // 分批听（每批 40 句）：一句出错或一批失败，不影响其他句子
  const code = "import sys,json,mlx_whisper\nfs=json.load(open(sys.argv[1]))\nout={}\nfor f in fs:\n  try:\n    r=mlx_whisper.transcribe(f,path_or_hf_repo='mlx-community/whisper-large-v3-turbo',language='zh',initial_prompt='以下是普通话的句子。')\n    out[f]=r.get('text','').strip()\n  except Exception as e:\n    sys.stderr.write(str(e)[:200]+'\\n')\nprint(json.dumps(out,ensure_ascii=False))";
  // NO_PROXY 里的「[::1]」会让有的 httpx 版本报 Invalid port，每句都失败：去掉方括号地址
  const cleanNP = (v) => v && v.split(",").filter((x) => !/^\s*\[/.test(x)).join(",");
  const penv = { ...process.env }; for (const k of ["NO_PROXY", "no_proxy"]) if (penv[k]) penv[k] = cleanNP(penv[k]);
  const all = {}; let firstErr = "";
  for (let i = 0; i < files.length; i += 40) {
    const lst = path.join(work, `list-${Date.now()}-${i}.json`); writeFileSync(lst, JSON.stringify(files.slice(i, i + 40)));
    const r = spawnSync(py, ["-c", code, lst], { encoding: "utf8", timeout: 900_000, maxBuffer: 64 << 20, env: penv });
    rmSync(lst, { force: true });
    firstErr ||= String(r.stderr || "").trim().split("\n").filter(Boolean).pop() || "";
    if (r.status !== 0) { console.log(`  听写第 ${i / 40 + 1} 批没成功：${String(r.stderr || r.error || "").trim().split("\n").pop().slice(0, 160)}`); continue; }
    try { Object.assign(all, JSON.parse(r.stdout.trim().split("\n").pop())); } catch { console.log(`  听写第 ${i / 40 + 1} 批的结果读不了`); }
    if (files.length > 40) console.log(`  已听写 ${Math.min(i + 40, files.length)}/${files.length} 句…`);
  }
  const n = Object.keys(all).length;
  if (!n) { console.log(`  听写没有返回任何结果，这次不算做过听写复查${firstErr ? "。报错：" + firstErr.slice(0, 160) : ""}`); return null; }
  if (n < files.length) console.log(`  听写只返回了 ${n}/${files.length} 句，其余没复查${firstErr ? "。报错：" + firstErr.slice(0, 160) : ""}`);
  return all;
}

// ---------- 主流程 ----------
const t0 = Date.now();
await pool(todo, 2, make);
const med = {};
for (const l of LABELS) { const rs = jobs.filter((u) => u.speaker === l && count(u.text) >= 5 && T(u)[0]?.rate > 0).map((u) => T(u)[0].rate).sort((a, b) => a - b); med[l] = rs[Math.floor(rs.length / 2)] || 4.5; }
const okBasic = (t, u) => t.dur > 0.2 && t.maxGap < 0.9 && (t.clipped ?? (t.peak < -0.3 ? 0 : 99)) < 20 && (count(u.text) < 5 || (t.rate > med[u.speaker] * 0.62 && t.rate < med[u.speaker] * 1.5));
const pick = (u) => T(u).slice().sort((a, b) => (okBasic(b, u) - okBasic(a, u)) || ((b.sim ?? 0) - (a.sim ?? 0)) || (Math.abs(a.rate - med[u.speaker]) - Math.abs(b.rate - med[u.speaker])))[0];
for (let round = 0; round < 2; round++) {
  const need = jobs.filter((u) => T(u).length < 3 && !T(u).some((t) => okBasic(t, u)));
  if (!need.length) break; await pool(need, 2, make);
}
let asr = "跳过了语音识别复查";
if (!flag("--no-asr")) {
  const hear = (list) => { const files = list.map((u) => path.join(takesDir, pick(u).file)); const h = listen(files); if (!h) return false; list.forEach((u, k) => { const x = pick(u); if (h[files[k]] !== undefined) { x.heard = h[files[k]]; x.sim = similar(h[files[k]], u.text); } }); saveCache(); return true; };
  const unheard = () => jobs.filter((u) => count(u.text) >= 4 && pick(u).sim === undefined);
  if (!unheard().length || hear(unheard())) {
    for (let round = 0; round < 2; round++) {
      const need = jobs.filter((u) => count(u.text) >= 4 && (pick(u).sim ?? 1) < 0.72 && T(u).length < 3);
      if (!need.length) break;
      await pool(need, 2, make);
      // 新的一版也要听一遍
      const fresh = need.map((u) => ({ u, t: T(u)[T(u).length - 1] })), files = fresh.map((x) => path.join(takesDir, x.t.file)), h = listen(files) || {};
      fresh.forEach((x, k) => { if (h[files[k]] !== undefined) { x.t.heard = h[files[k]]; x.t.sim = similar(h[files[k]], x.u.text); } }); saveCache();
    }
    const heard = us.filter((u) => count(u.text) < 4 || pick(u).sim !== undefined), low = heard.filter((u) => count(u.text) >= 4 && pick(u).sim < 0.72);
    asr = `语音识别逐句复查：${heard.length - low.length}/${us.length} 句对得上` + (heard.length < us.length ? `，${us.length - heard.length} 句没听写成` : "");
  } else asr = findWhisper() ? "听写复查没做成（报错见上面），这一版没有经过听写检查" : "本机没有可用的语音识别（mlx_whisper），没做听写复查";
}

// ---------- 4. 拼接：两个声音先各自对齐音量，再按停顿拼起来 ----------
function wavData(file) {
  const b = readFileSync(file); let p = 12;
  while (p + 8 <= b.length) { const id = b.toString("ascii", p, p + 4), sz = b.readUInt32LE(p + 4); if (id === "data") return b.subarray(p + 8, Math.min(b.length, p + 8 + sz)); p += 8 + sz + (sz & 1); }
  throw new Error("音频文件读不了：" + file);
}
function writeWav(file, chunks) {
  const len = chunks.reduce((a, c) => a + c.length, 0), h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + len, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(len, 40);
  writeFileSync(file, Buffer.concat([h, ...chunks]));
}
const gainOf = (buf, db) => { if (Math.abs(db) < 0.1) return buf; const g = 10 ** (db / 20), out = Buffer.allocUnsafe(buf.length); for (let i = 0; i + 1 < buf.length; i += 2) { const v = Math.round(buf.readInt16LE(i) * g); out.writeInt16LE(v > 32767 ? 32767 : v < -32768 ? -32768 : v, i); } return out; };
const silence = (s) => Buffer.alloc(Math.round(s * SR) * 2);
const pcm = new Map(jobs.map((u) => [u.hash, wavData(path.join(takesDir, pick(u).file))]));
const gain = {};
for (const l of LABELS) {
  const mine = jobs.filter((u) => u.speaker === l); if (!mine.length) continue;
  const f = path.join(work, `loud-${LABELS.indexOf(l)}.wav`); writeWav(f, mine.map((u) => pcm.get(u.hash)));
  const m = /"input_i"\s*:\s*"(-?[\d.]+)"/.exec(ff(["-i", f, "-af", "loudnorm=print_format=json", "-f", "null", "-"]).stderr);
  if (m) gain[l] = +m[1]; rmSync(f, { force: true });
}
// 向几个声音的平均响度靠拢（整体响度留给最后一步统一），这样补偿量小、不会削波
const loudAvg = Object.values(gain).reduce((a, b) => a + b, 0) / (Object.values(gain).length || 1);
for (const l of Object.keys(gain)) gain[l] = clamp(loudAvg - gain[l], -12, 12);
// 放到时间线上：平时一句接一句；有「抢/快」标记的话轮提前切入，和上一句的尾巴叠在一起，上一句的尾巴压低音量
const duck = (buf, n) => { const out = Buffer.from(buf), total = buf.length / 2, from = Math.max(0, total - n), ramp = Math.round(0.06 * SR);
  for (let i = from; i < total; i++) { const g = 1 - 0.55 * Math.min(1, (i - from) / ramp); out.writeInt16LE(Math.round(out.readInt16LE(i * 2) * g), i * 2); } return out; };
const clips = us.map((u) => gainOf(pcm.get(u.hash), gain[u.speaker] || 0)), starts = [];
let cursor = Math.round(0.2 * SR), lastEnd = cursor;
us.forEach((u, k) => {
  const n = clips[k].length / 2; let st = cursor;
  if (u.overlap && k > 0) {
    const prevN = clips[k - 1].length / 2, ov = Math.min(Math.round(u.overlap * SR), Math.floor(prevN / 2));
    st = starts[k - 1] + prevN - ov; clips[k - 1] = duck(clips[k - 1], ov + Math.round(0.12 * SR));
  }
  starts.push(st); u.start = st / SR; lastEnd = Math.max(lastEnd, st + n); cursor = lastEnd + Math.round(u.pause_after * SR);
});
const mix = Buffer.alloc(cursor * 2);
clips.forEach((c, k) => { for (let i = 0, o = starts[k] * 2; i + 1 < c.length; i += 2, o += 2) { const v = mix.readInt16LE(o) + c.readInt16LE(i); mix.writeInt16LE(v > 32767 ? 32767 : v < -32768 ? -32768 : v, o); } });
const pos = cursor / SR;
const joined = path.join(work, "joined.wav"), mp3 = path.join(DIR, NAME + ".mp3");
writeWav(joined, [mix]);
// 章节：每个「## 小标题」一章，写进 MP3（支持章节的播放器可以直接跳），也写进节目单
const chapters = sections.map((sec, i) => { const u = us.find((x) => x.turn > sec.from); return u ? { name: sec.name, start: u.start } : null; }).filter(Boolean)
  .map((c, i, a) => ({ ...c, end: a[i + 1] ? a[i + 1].start : pos }));
const metaFile = path.join(work, "chapters.txt"), escMeta = (s) => s.replace(/[=;#\\\n]/g, (c) => "\\" + c);
writeFileSync(metaFile, ";FFMETADATA1\n" + chapters.map((c) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round(c.end * 1000)}\ntitle=${escMeta(c.name)}\n`).join(""));
const out = ff(["-y", "-i", joined, "-i", metaFile, "-map", "0:a", "-map_metadata", "1", "-map_chapters", "1", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", String(SR), "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", "-id3v2_version", "3", "-metadata", `title=${NAME}`, "-metadata", "genre=Podcast", mp3]);
rmSync(joined, { force: true }); rmSync(metaFile, { force: true });
if (out.status !== 0) { console.error("拼接失败：" + out.stderr.slice(-300)); process.exit(1); }

// ---------- 5. 报告 ----------
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const low = us.filter((u) => count(u.text) >= 4 && (pick(u).sim ?? 1) < 0.72), badBasic = us.filter((u) => !okBasic(pick(u), u));
const retried = jobs.filter((u) => T(u).length > 1).length;
writeFileSync(path.join(work, "报告.md"), `# 配音报告 · ${NAME}\n\n- 时长 ${mmss(pos)}，${us.length} 句，约 ${totalChars} 字 · ${MODEL}\n` +
  LABELS.map((l) => `- ${l}（${SPEAKERS[l].role || ""}）：${SPEAKERS[l].voice_id}，音量补偿 ${(gain[l] || 0).toFixed(1)} dB`).join("\n") +
  `\n- ${asr}\n- 重生成过的句子：${retried} 句\n\n| # | 时间 | 谁 | 文字 | 情绪 | 句后停顿 | 版本 | 听写相似度 |\n|---|---|---|---|---|---|---|---|\n` +
  us.map((u, k) => `| ${k + 1} | ${mmss(u.start)} | ${u.speaker} | ${u.text.replace(/\|/g, "／")} | ${u.emotion}${u.overlap ? (u.overlap > 0.2 ? " 抢话" : " 快接") : ""} | ${u.pause_after} | ${T(u).length} 版选 ${pick(u).file.match(/v\d+/)[0]} | ${pick(u).sim?.toFixed(2) ?? "-"}${pick(u).sim < 0.72 && pick(u).heard ? `（听成：${pick(u).heard.replace(/\|/g, "／").slice(0, 60)}）` : ""}${okBasic(pick(u), u) ? "" : " 质检没过"} |`).join("\n") + "\n");
// ---------- 6. 附带的学习材料：自测题、闪卡、节目单 ----------
const clean = (s) => s.replace(/\([a-z-]+\)/gi, "").replace(/<#[\d.]+#>/g, "").replace(/\s+/g, " ").trim();
const quiz = []; // 自测题：后面跟着 [停 N 秒] 的那句是问题，之后到下一题或下一段之前是答题思路
turns.forEach((t, i) => { if (!(t.extraPause >= 4)) return; const ans = []; for (let j = i + 1; j < turns.length && !(turns[j].extraPause >= 4); j++) { ans.push(clean(turns[j].text)); if (turns[j].sectionEnd) break; }
  const q = clean(t.text).replace(/^.*?(第[一二三四五六七八九十\d]+[个道]?(?:问题)?[：:，,]\s*)/, ""); quiz.push({ q, a: ans.join(" ") }); });
const extras = [];
if (quiz.length) {
  writeFileSync(path.join(DIR, "自测.md"), `# 自测 · ${NAME}\n\n先自己答，再看答题思路。\n\n` + quiz.map((x, i) => `**${i + 1}. ${x.q}**\n\n<details><summary>答题思路</summary>\n\n${x.a}\n\n</details>\n`).join("\n"));
  const csv = (s) => `"${s.replace(/"/g, '""')}"`;
  writeFileSync(path.join(DIR, "闪卡.csv"), quiz.map((x) => `${csv(x.q)},${csv(x.a)}`).join("\n") + "\n"); // 可以直接导入 Anki 等闪卡软件（正面,背面）
  extras.push("自测.md", "闪卡.csv");
}
{
  const srcs = readdirSync(DIR).filter((x) => /^原文(-\d+)?\.md$/.test(x)).sort().map((f) => { const s = readFileSync(path.join(DIR, f), "utf8").slice(0, 1200); const ti = (/^#\s+(.+)$/m.exec(s) || [])[1] || f, from = (/^>\s*来源：(.+)$/m.exec(s) || [])[1] || "", by = (/^>\s*作者：(.+)$/m.exec(s) || [])[1] || ""; const url = (/(https?:\/\/\S+)/.exec(from) || [])[1]; return `- ${url ? `[${ti}](${url})` : ti}${by ? `（${by}）` : ""}`; });
  const briefF = path.join(DIR, "精讲稿.md"), one = existsSync(briefF) ? ((/##\s*一句话\s*\n+([^\n#][^\n]*)/.exec(readFileSync(briefF, "utf8")) || [])[1] || "").replace(/【([^】]+)】/g, (m, k) => k.split(/[\/／|]/)[0]).replace(/\s*[（(][①-⑳\d、，, ]+[)）]/g, "").replace(/\s*（(看法|延伸)）/g, "") : "";
  writeFileSync(path.join(DIR, "节目单.md"), `# ${NAME}\n\n时长 ${mmss(pos)}\n\n` + (one ? `${one}\n\n` : "") + (chapters.length ? "## 章节\n\n" + chapters.map((c) => `- ${mmss(c.start)} ${c.name}`).join("\n") + "\n\n" : "") +
    (quiz.length ? "## 自测\n\n" + quiz.map((x, i) => `${i + 1}. ${x.q}`).join("\n") + "\n\n答题思路见 自测.md。\n\n" : "") + (srcs.length ? "## 来源\n\n" + srcs.join("\n") + "\n" : ""));
  extras.unshift("节目单.md");
}
console.log(`做好了：${mp3}`);
console.log(`  附带：${extras.join("、")}${chapters.length ? `；MP3 里写了 ${chapters.length} 个章节` : ""}`);
if (flag("--send")) { // 做完发到手机：命令写在用户配置的 send 里，{file} 换成 MP3 文件名、{title} 换成标题（在这一期的文件夹里执行）
  const cmd = LOCAL.send;
  if (!Array.isArray(cmd) || !cmd.length) console.log(`  没有发送：${path.join(USER_DIR, "config.json")} 里没有 send 命令`);
  else { const r = spawnSync(cmd[0], cmd.slice(1).map((a) => a.replace("{file}", path.basename(mp3)).replace("{title}", NAME)), { cwd: path.resolve(DIR), encoding: "utf8", timeout: 300_000 });
    console.log(r.status === 0 ? "  已发送到手机" : `  发送没成功：${String(r.stderr || r.error || r.stdout || "").trim().slice(-200)}`); }
}
console.log(`  时长 ${mmss(pos)}，${us.length} 句；本次新合成 ${made} 句（计费约 ${chars} 字），重生成过 ${retried} 句，用时 ${Math.round((Date.now() - t0) / 1000)} 秒`);
console.log(`  ${asr}`);
if (low.length) console.log(`  听着可能不准的句子（请留意）：` + low.map((u) => `${mmss(u.start)}「${u.text.slice(0, 16)}」`).join("、"));
if (badBasic.length) console.log(`  质检没过的句子（语速、停顿或削波异常，请听一下）：` + badBasic.map((u) => `${mmss(u.start)}「${u.text.slice(0, 16)}」`).join("、"));
