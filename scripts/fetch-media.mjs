#!/usr/bin/env node
// 音视频 → 文字稿（原文.md）。不依赖第三方 npm 包；需要 ffmpeg，转写用本机 mlx_whisper，网上的视频用 yt-dlp 下载。
// 用法：node fetch-media.mjs <链接或本地音视频文件> -o <这一期的文件夹>/原文.md [--keep-audio]
//   本地文件：mp3 / m4a / wav / mp4 / mov / mkv …… 直接转写
//   YouTube：先找字幕（人工字幕优先，再自动字幕），没有字幕再下载音频转写
//   小宇宙等播客网页：从页面里找音频地址（og:audio、enclosure），下载后转写，节目简介一起存下
//   B 站、喜马拉雅等：用 yt-dlp 下载音频后转写
// 退出码：2 打不开 / 不支持；3 要登录、会员或人机验证；5 缺工具（ffmpeg、yt-dlp、mlx_whisper）
import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2), HOME = os.homedir();
const OUT = argv.includes("-o") ? argv[argv.indexOf("-o") + 1] : null;
const src = argv.find((a, i) => !a.startsWith("-") && argv[i - 1] !== "-o");
if (!src || !OUT) { console.error("用法：node fetch-media.mjs <链接或本地音视频文件> -o <文件夹>/原文.md [--keep-audio]"); process.exit(1); }
const die = (code, msg) => { console.error(msg); process.exit(code); };
const work = path.join(path.dirname(path.resolve(OUT)), ".素材"); mkdirSync(work, { recursive: true });
const find = (names, flag = "--version") => names.find((c) => spawnSync(c, [flag], { encoding: "utf8" }).status === 0);
const FFMPEG = find(["ffmpeg", path.join(HOME, ".local/bin/ffmpeg"), "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"], "-version");
const YTDLP = find(["yt-dlp", path.join(HOME, ".local/bin/yt-dlp"), "/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp"]);
if (!FFMPEG) die(5, "找不到 ffmpeg。macOS：brew install ffmpeg");
const mmss = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const decode = (s) => String(s || "").replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const strip = (h) => decode(h).replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();

let meta = { kind: "", url: "", title: "", author: "", date: "", duration: 0, notes: "" }, audio = null, text = null, how = "";

// ---------- 1. 拿到音频或字幕 ----------
const isURL = /^https?:\/\//i.test(src);
if (!isURL) {
  if (!existsSync(src)) die(2, "找不到文件：" + src);
  audio = path.resolve(src); meta.kind = "本地音视频"; meta.url = audio; meta.title = path.basename(src).replace(/\.[^.]+$/, "");
} else {
  meta.url = src;
  const host = new URL(src).hostname;
  const yt = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host);
  const ytdlpMeta = () => {
    if (!YTDLP) return false;
    const r = spawnSync(YTDLP, ["--no-warnings", "--no-playlist", "--skip-download", "--print", "%(title)s\t%(uploader)s\t%(upload_date)s\t%(duration)s", src], { encoding: "utf8", timeout: 120_000 });
    if (r.status !== 0) { const e = String(r.stderr || ""); if (/sign in|login|members|cookies|confirm you|premium|付费|大会员/i.test(e)) die(3, "这个视频要登录、会员或人机验证才能看，不去绕过。请换一个公开的链接，或者把音视频文件下载好交给我。\n" + e.trim().split("\n").pop()); return false; }
    const [t, u, d, du] = r.stdout.trim().split("\n").pop().split("\t");
    Object.assign(meta, { title: t, author: u === "NA" ? "" : u, date: /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : "", duration: +du || 0 }); return true;
  };
  if (yt) {
    meta.kind = "YouTube";
    if (!YTDLP) die(5, "需要 yt-dlp。macOS：brew install yt-dlp");
    ytdlpMeta();
    // 先找字幕：人工字幕（中文优先）→ 原语言的自动字幕
    for (const [flag, langs] of [["--write-subs", "zh-Hans,zh-CN,zh,zh-Hant,zh-TW,en,en-US,en-GB"], ["--write-auto-subs", "zh-Hans,zh,en,en-orig"]]) {
      for (const f of readdirSync(work)) if (f.startsWith("sub.")) rmSync(path.join(work, f));
      spawnSync(YTDLP, ["--no-warnings", "--no-playlist", "--skip-download", flag, "--sub-langs", langs, "--sub-format", "vtt", "-o", path.join(work, "sub.%(ext)s"), src], { encoding: "utf8", timeout: 180_000 });
      const subs = readdirSync(work).filter((f) => f.startsWith("sub.") && f.endsWith(".vtt"));
      const best = langs.split(",").map((l) => subs.find((f) => f === `sub.${l}.vtt`)).find(Boolean) || subs[0];
      if (best) { text = vttToText(readFileSync(path.join(work, best), "utf8")); how = `${flag === "--write-subs" ? "视频自带字幕" : "YouTube 自动字幕"}（${best.slice(4, -4)}）`; break; }
    }
  } else {
    // 播客网页：页面里有音频地址就直接用（小宇宙、很多播客托管站都有 og:audio 或 enclosure）
    let html = "";
    try { const r = await fetch(src, { headers: { "User-Agent": UA }, redirect: "follow" }); if (r.ok) html = await r.text(); } catch {}
    const au = (/<meta[^>]+property=["']og:audio(?::url)?["'][^>]+content=["']([^"']+)/i.exec(html) || /"enclosure"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/.exec(html) || [])[1];
    if (au) {
      meta.kind = /xiaoyuzhoufm\.com$/.test(host) ? "小宇宙" : "播客网页";
      const t = decode((/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(html) || /<title>([^<]+)/i.exec(html) || [])[1] || "");
      const [title, show] = t.split(/\s+-\s+/);
      Object.assign(meta, { title: (title || t).trim(), author: (show || "").replace(/\s*\|.*$/, "").trim() });
      meta.duration = +((/"duration"\s*:\s*(\d+)/.exec(html) || [])[1] || 0);
      const pub = (/"pubDate"\s*:\s*"([^"]+)"/.exec(html) || [])[1]; if (pub) meta.date = pub.slice(0, 10);
      const notes = (/"shownotes"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(html) || [])[1] || (/<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)/i.exec(html) || [])[1];
      if (notes) meta.notes = strip(notes.replace(/\\n/g, "\n").replace(/\\"/g, '"'));
      const ext = (/\.(mp3|m4a|aac|wav|ogg|opus)(\?|$)/i.exec(au) || [0, "mp3"])[1];
      audio = path.join(work, "audio." + ext);
      console.log(`下载音频：${meta.title}${meta.duration ? `（${mmss(meta.duration)}）` : ""}`);
      const r = await fetch(decode(au), { headers: { "User-Agent": UA }, redirect: "follow" });
      if (!r.ok) die(2, `音频下载失败：HTTP ${r.status}`);
      writeFileSync(audio, Buffer.from(await r.arrayBuffer()));
    } else {
      // B 站、喜马拉雅和其他 yt-dlp 支持的网站
      if (!YTDLP) die(5, "这个链接需要 yt-dlp 才能下载。macOS：brew install yt-dlp");
      meta.kind = /bilibili\.com$|b23\.tv$/.test(host) ? "B 站" : /ximalaya\.com$/.test(host) ? "喜马拉雅" : "网上视频";
      if (!ytdlpMeta()) die(2, "这个链接取不到音视频。如果是文章，请用 fetch-article.mjs；如果是视频，确认链接能公开打开。");
    }
  }
  if (!text && !audio) {
    console.log(`下载音频：${meta.title}${meta.duration ? `（${mmss(meta.duration)}）` : ""}`);
    const r = spawnSync(YTDLP, ["--no-warnings", "--no-playlist", "-f", "bestaudio/best", "-o", path.join(work, "audio.%(ext)s"), src], { encoding: "utf8", timeout: 1_800_000 });
    const got = readdirSync(work).find((f) => f.startsWith("audio."));
    if (r.status !== 0 || !got) { const e = String(r.stderr || "").trim().split("\n").pop(); if (/sign in|login|members|cookies|confirm you|premium|大会员/i.test(e)) die(3, "这个视频要登录、会员或人机验证才能看，不去绕过。请换一个公开的链接，或者把音视频文件下载好交给我。"); die(2, "音频下载失败：" + e); }
    audio = path.join(work, got);
  }
}

// ---------- 2. 转写（本机 mlx_whisper） ----------
function vttToText(v) {
  const out = []; let last = "", t0 = null, buf = "";
  for (const block of v.replace(/\r/g, "").split(/\n\n+/)) {
    const m = /(\d+):(\d+):(\d+)\.\d+\s+-->/.exec(block) || /(\d+):(\d+)\.\d+\s+-->/.exec(block); if (!m) continue;
    const sec = m.length === 4 ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
    const lines = block.split("\n").filter((l) => l && !/-->|^\d+$|^WEBVTT|^Kind:|^Language:/.test(l)).map((l) => l.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
    for (const l of lines) { if (l === last || last.endsWith(l)) continue; last = l; if (t0 === null) t0 = sec; buf += (buf && /[a-z0-9,.]$/i.test(buf) ? " " : "") + l; if (buf.length > 260 || /[。！？.!?]$/.test(l) && buf.length > 160) { out.push(`[${mmss(t0)}] ${buf}`); buf = ""; t0 = null; } }
  }
  if (buf) out.push(`[${mmss(t0 ?? 0)}] ${buf}`);
  return out.join("\n\n");
}
function findWhisper() {
  for (const c of ["mlx_whisper", "/opt/homebrew/bin/mlx_whisper", "/usr/local/bin/mlx_whisper"]) if (spawnSync(c, ["--help"], { encoding: "utf8" }).status === 0) return c;
  const b = path.join(HOME, "Library", "Python"); if (!existsSync(b)) return null;
  for (const v of readdirSync(b)) { const f = path.join(b, v, "bin", "mlx_whisper"); if (existsSync(f)) return f; }
  return null;
}
if (!text) {
  const w = findWhisper();
  if (!w) die(5, "转写需要 mlx_whisper（Apple 芯片的 Mac）：pip3 install mlx-whisper。其他系统可以先用别的工具转成文字，再把文字交给我。");
  let py = "python3"; try { const sb = readFileSync(w, "utf8").split("\n")[0]; if (sb.startsWith("#!")) py = sb.slice(2).trim().split(/\s+/)[0]; } catch {}
  const wav = path.join(work, "audio16k.wav");
  if (spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-i", audio, "-vn", "-ac", "1", "-ar", "16000", wav]).status !== 0) die(2, "这个文件读不出声音：" + audio);
  const dur = +((/Duration: (\d+):(\d+):([\d.]+)/.exec(spawnSync(FFMPEG, ["-i", wav], { encoding: "utf8" }).stderr) || []).slice(1).reduce((a, x, i) => a + x * [3600, 60, 1][i], 0)) || meta.duration;
  meta.duration ||= dur;
  console.log(`本机转写中（${mmss(dur)} 的音频，Apple 芯片上大约要 ${Math.max(1, Math.round(dur / 60 / 12))} 分钟）…`);
  const prompt = `以下是普通话的节目。${meta.title ? "标题：" + meta.title + "。" : ""}`;
  const code = "import sys,json,mlx_whisper\nr=mlx_whisper.transcribe(sys.argv[1],path_or_hf_repo='mlx-community/whisper-large-v3-turbo',initial_prompt=sys.argv[2],condition_on_previous_text=False)\nprint(json.dumps({'lang':r.get('language',''),'seg':[[s['start'],s['end'],s['text']] for s in r.get('segments',[])]},ensure_ascii=False))";
  const env = { ...process.env }; for (const k of ["NO_PROXY", "no_proxy"]) if (env[k]) env[k] = env[k].split(",").filter((x) => !/^\s*\[/.test(x)).join(",");
  const r = spawnSync(py, ["-c", code, wav, prompt], { encoding: "utf8", timeout: 7_200_000, maxBuffer: 256 << 20, env });
  if (r.status !== 0) die(2, "转写失败：" + String(r.stderr || "").trim().split("\n").pop());
  const res = JSON.parse(r.stdout.trim().split("\n").pop());
  // 按停顿和长度分段，每段开头标时间点，方便回头核对
  const paras = []; let cur = null, prevEnd = 0;
  for (const [s, e, t0] of res.seg) {
    const t = t0.trim(); if (!t) continue;
    if (!cur || s - prevEnd > 1.6 || cur.text.length > 220) { if (cur) paras.push(cur); cur = { s, text: "" }; }
    cur.text += (cur.text && /[a-z0-9]$/i.test(cur.text) && /^[a-z0-9]/i.test(t) ? " " : "") + t; prevEnd = e;
  }
  if (cur) paras.push(cur);
  text = paras.map((p) => `[${mmss(p.s)}] ${p.text}`).join("\n\n");
  how = `本机语音识别（mlx-whisper large-v3-turbo，识别语言 ${res.lang || "?"}）`;
}
if (!argv.includes("--keep-audio")) rmSync(work, { recursive: true, force: true });

// ---------- 3. 存成原文.md ----------
const plain = text.replace(/\[\d+(?::\d+)+\]/g, "");
const nHan = (plain.match(/[一-鿿]/g) || []).length, nWords = (plain.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
const nKana = (plain.match(/[぀-ヿ]/g) || []).length;
const lang = nKana > 50 && nKana > nHan * 0.2 ? "日文" : nWords > nHan * 0.6 && nWords > 80 ? "英文" : "中文";
const size = lang === "中文" ? `约 ${nHan} 字` : `约 ${nWords} 个词`;
const md = `# ${meta.title || "（无标题）"}\n\n> 来源：${meta.kind} · ${meta.url}\n` + (meta.author ? `> 作者：${meta.author}\n` : "") + (meta.date ? `> 发布：${meta.date}\n` : "") +
  (meta.duration ? `> 时长：${mmss(meta.duration)}\n` : "") + (lang !== "中文" ? `> 语言：${lang}\n` : "") +
  `> 文字来自：${how}。没有区分说话人，可能有听错的字，人名、术语和数字写稿前要核对。\n> 抓取：${new Date().toISOString().slice(0, 10)} · ${size}\n\n` +
  (meta.notes ? `## 节目简介\n\n${meta.notes}\n\n## 文字稿\n\n` : "") + text + "\n";
writeFileSync(OUT, md);
console.log(`已保存：${OUT}\n  标题：${meta.title}\n  ${meta.author ? "作者：" + meta.author + "\n  " : ""}${meta.duration ? "时长：" + mmss(meta.duration) + "\n  " : ""}文字来自：${how}\n  正文${size}` +
  (lang !== "中文" ? `\n  内容是${lang}：先翻成中文存为 译文.md，再写精讲稿（见 references/输入源.md「外文材料」）` : ""));
