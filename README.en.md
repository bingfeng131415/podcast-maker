<div align="center">

# 🎙️ podcast-maker

**Hand your agent an article, a video, a document — or just a topic.<br>It writes a two-host Mandarin Chinese podcast, voices it line by line, and you get it after one listen on your commute.**

[中文](README.md) | **English**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-Claude%20Code%20%7C%20Codex-D9774A)](#-quick-start)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-339933)](https://nodejs.org)
[![TTS](https://img.shields.io/badge/TTS-MiniMax%20%7C%20Doubao%20%7C%20ElevenLabs-3F6B5B)](#-voices-and-tts-providers)
[![GitHub stars](https://img.shields.io/github/stars/bingfeng131415/podcast-maker?style=social)](https://github.com/bingfeng131415/podcast-maker/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/bingfeng131415/podcast-maker)](https://github.com/bingfeng131415/podcast-maker/commits/main)

[⚡ Quick start](#-quick-start) • [💡 Scenarios](#-scenarios) • [📥 Sources](#-what-it-can-read) • [✨ Features](#-features) • [🆚 vs NotebookLM](#-vs-notebooklm) • [📊 Numbers](#-real-world-numbers) • [❓ FAQ](#-faq)

</div>

![podcast-maker](assets/banner.png)

> **The podcasts are in Mandarin Chinese.** Sources can be Chinese, English or other languages; foreign-language material is translated in full first.

## 🎯 What is it?

An **Agent Skill** for Claude Code, Codex and similar agents. Say one sentence; it reads the material, writes the script, checks it, voices it, and hands you an MP3:

```
You:   Make a podcast from this WeChat article
Agent: ✅ 11-minute two-host conversation → MP3 (all 29 key facts covered)

You:   Give me the gist of this Xiaoyuzhou episode on AI coding
Agent: ✅ 76-minute show transcribed locally in 4.5 min (~22,000 characters) → script → audio

You:   Do an episode on the "AI+" action plan, for non-experts
Agent: ✅ Found 3 official sources → you confirm → 6:30 conversation with chapters, quiz and flashcards
```

Saved articles pile up and rarely get read. Text-to-speech readers drone through the original and you tune out in two minutes; a five-line AI summary loses the numbers and the reasoning. **podcast-maker has one host ask your questions and the other explain in plain words.**

- **Understand it in one listen, not a read-aloud.** An opening, topics, a discussion, and 2–3 quiz questions at the end, each followed by a few seconds of silence.
- **Nothing important gets dropped.** The brief marks must-mention claims, numbers, names and dates with 【】, and the script is **checked against every mark** before voicing.
- **Clear to non-experts, or to whoever you name.** Default listener: a smart non-expert — deep content, plain words. Say "explain it for my parents" or "focus on what it means for ordinary people" and the episode takes that angle.
- **Reliable audio.** Each line is synthesized separately, then **transcribed back** locally; mismatches are re-voiced automatically.

## ⚡ Quick start

**Requires:** Node.js 18+, ffmpeg, an API key for one TTS provider ([MiniMax](https://www.minimax.io) by default). Optional: [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) (transcription check and audio/video-to-text on Apple Silicon), [yt-dlp](https://github.com/yt-dlp/yt-dlp) (YouTube, Bilibili).

**1. Install it into your agent**

```bash
git clone https://github.com/bingfeng131415/podcast-maker ~/.claude/skills/podcast-maker   # Claude Code
git clone https://github.com/bingfeng131415/podcast-maker ~/.codex/skills/podcast-maker    # Codex
git clone https://github.com/bingfeng131415/podcast-maker ~/.agents/skills/podcast-maker   # other Agent Skills tools
```

**2. Add your key and run the environment check**

```bash
mkdir -p ~/.config/podcast-maker
cp ~/.claude/skills/podcast-maker/.env.example ~/.config/podcast-maker/.env   # fill in MINIMAX_API_KEY
node ~/.claude/skills/podcast-maker/scripts/doctor.mjs --online               # what's missing, does the key work (free)
```

It lists each requirement with ✓ / ✗ / ○ and the exact command to fix anything missing; `--online` confirms the MiniMax key by listing voices (no synthesis, no charge).

**3. Voice the 30-second sample first**

```bash
cd ~/.claude/skills/podcast-maker
node scripts/podcast-tts.mjs examples/样片 --plan   # health check, free
node scripts/podcast-tts.mjs examples/样片          # voice it
```

Real result: 0:33, 8 lines, ~237 characters billed, 27 seconds, **8/8 lines passed the transcription check**.

▶ **[Listen to these 30 seconds](assets/sample.mp3)** (default voices: "Warm Bestie" host, "Reliable Executive" explainer)

**4. From then on, just talk to your agent.**

## 💡 Scenarios

All output below comes from real runs except scenario 4 (illustration). The tool itself speaks Chinese; English notes are added.

### 1. A long WeChat article → an 11-minute conversation

```
You: Make a podcast from this: https://mp.weixin.qq.com/s/...

Agent:
  ✓ Extracted ~8,700 characters, 17 images
  ✓ Brief: ~750 characters, 5 key points, 29 facts marked with 【】
  ✓ Script: 122 turns; first health check gave 3 warnings → two rounds of edits → clean
  ✓ Voiced 150 lines; transcription check 150/150; 7 failing lines re-voiced automatically
✅ MP3 (10:57, 9 chapters) + show notes + quiz + flashcards, sent to Feishu
```

The first health check flagged: the explainer had **66%** of the words (limit 65%), too few sound tags, and **9** English words and acronyms. **The 【】 check also caught numbers an older draft had dropped**: the article says **298** merge requests reviewed, **333** issues found, **306** fixed before merging; the old draft said "almost three hundred", "over three hundred", "most of them".

### 2. A 76-minute Xiaoyuzhou podcast episode → transcript → brief

```
You: Give me the gist of this episode on AI coding: https://www.xiaoyuzhoufm.com/episode/...

Agent:
  ✓ Found the audio on the page, downloaded it (1:15:59) with the show notes
  ✓ Local mlx-whisper transcription: 4 min 34 s for download + transcription, ~22,000 characters, timestamped paragraphs
  ✓ Brief organized by topic, not by timeline → then the same as scenario 1
```

The transcript **doesn't separate speakers and has typos** (it misheard the show name 科技乱炖 as 科技乱顿), so the Skill tells the agent to check names and terms against the show notes and keep uncertain ones out of 【】.

### 3. Just a topic → research → several sources in one episode

```
You: Do an episode on the "AI+" action plan, for non-experts

Agent:
  ✓ Searched and picked 3 sources, listed in 来源清单.md for you to confirm:
      ① State Council opinion on the "AI+" action, full text (2025-08-21)
      ② NDRC official Q&A (Xinhua, 08-26)
      ③ NDRC press conference (Xinhua, 08-29)
  ✓ Followed the policy-document guide: first, what kind of document it is and whether citizens must do anything
  ✓ Brief organized by topic, each point tagged with its sources; 20 【】 facts, all covered
  ✓ First health check: only 1 interruption, too few sound tags → one round of edits → clean
✅ 人工智能+行动的意见，跟你有什么关系.mp3 (6:30, 8 chapters)
```

### 4. The same point, for different listeners (illustration)

| You say | The host asks | The explainer says |
|---|---|---|
| nothing (default non-expert) | "That word makes my head spin." | "Think of it as the company mail room." |
| "Explain it for my parents" | "So what's in it for ordinary folks like us?" | "Like the parcel lockers at your building's gate: everything lands there first, then goes to each flat." |
| "Explain it for programmers" | "What does it add over a message queue?" | "A unified event format, de-duplication, rule-based routing, and a single outbound channel." |
| "Focus on getting started" | "If I want to build this, what's step one?" | "Don't build it all. Start with one inbox for events and one way to reach you." |

### 5. English source → translated first

```text
$ node scripts/fetch-article.mjs "https://www.anthropic.com/engineering/building-effective-agents" -o 原文.md
  标题：Building effective AI agents
  正文约 2672 个词，图片 8 张
  正文是英文：先翻成中文存为 译文.md，再写精讲稿
```

The extractor detects English (~2,672 words) and tells the agent to translate **in full** into `译文.md`, with a glossary of names, terms and figures. In the conversation, foreign institutions get a familiar Chinese comparison, and units and currencies are converted.

### 6. Several links, one episode each

Each link gets its own folder; all scripts are written and checked first, then voiced **one after another** in the background (parallel runs hit TTS rate limits), and you get a table of durations, files and lines to double-check.

## 📥 What it can read

<table>
<tr>
<td width="50%" valign="top">

### 📰 Articles and web pages
- **WeChat posts** (built-in extractor, zero dependencies)
- **Any public web page**: news, blogs, docs
- **English, Japanese and other languages**: translated first
- **Just a topic**: it researches and picks sources

### 🎧 Audio and video
- **Xiaoyuzhou** and other podcast pages (audio found on the page)
- **YouTube** (captions first, transcription if none)
- **Bilibili, Ximalaya** (via yt-dlp)
- **Local recordings and videos**: mp3, m4a, wav, mp4, mov…

</td>
<td width="50%" valign="top">

### 📚 Books and files
- **PDF** (long ones: only the range you name)
- **Word** (.docx)
- **EPUB**
- **Markdown, plain text, pasted text**

### 🧩 Combinations
- **One source, one episode**
- **Several sources, one episode**: organized by topic, comparing views
- **Several sources, one episode each**: queued for voicing

> 🔒 Anything behind a login, paywall or membership is not bypassed; export it yourself and hand over the file.

</td>
</tr>
</table>

## 🎁 What you get

| Output | What it's for | You might say |
|---|---|---|
| 📝 **Brief** `精讲稿.md` | The core at a glance; a study note | "Just the brief" |
| 💬 **Script** `对谈稿.md` | The full two-host transcript; edit it yourself | "Script only, no audio yet" |
| 🎙️ **Podcast** `title.mp3` | For the commute; one **chapter** per topic, so players with chapter support can skip around | "Make a podcast" (default) |
| 🗒️ **Show notes** `节目单.md` | One-line summary, chapter times, quiz, source links | generated with the audio |
| ❓ **Quiz** `自测.md` | Questions with collapsible answers | generated with the audio |
| 🃏 **Flashcards** `闪卡.csv` | Import straight into Anki and similar apps | generated with the audio |

Stop after any step; say "voice it" after reading the script and it picks up from there.

![How an episode is made](assets/flow.en.png)

## ✨ Features

**📝 Scripts: conversational, and clear**

- **Brief first, then dialogue.** The brief keeps only the core (500–1,000 characters for an article); anything added beyond the source is marked, never attributed to the author.
- **【】 fact check.** Mark a claim, number, person or date and it must be said; alternative wordings count, e.g. 【298/近三百】.
- **Eight genre guides.** Tech, policy, politics & world news, history, books & papers, business & finance, science & health, news & opinion — what to explain, what to mark, where mistakes happen.
- **Two roles with a split.** The host asks, follows up, guesses, paraphrases; the explainer explains, uses analogies, has opinions — and gets **at most 65%** of the words.
- **15-point health check.** Word share, long monologues, too-smooth exchanges, interruptions, sound tags, laughs, lecture phrases, jargon, English words, over-hedging, missing quiz, missing 【】 facts, missing translation… **Fix the warnings, then voice.**

**🎙️ Audio: natural, and dependable**

- **Line-by-line synthesis** with interruptions, quick replies, breaths, light laughs and quiz pauses on a timeline.
- **Line-by-line QC**: duration, speaking rate, odd silences, clipping, plus local transcription; failures are re-voiced, **up to 3 takes**, best one wins.
- **Numbers compared fairly**: "17" vs "十七", "2026年" vs "二零二六年" are normalized first.
- **Loudness matched** between voices; final MP3 at −16 LUFS.
- **Edit one line, re-voice one line.** Every line is cached.

**🧩 Integration: easy to install, easy to swap**

- **One-command environment check** (`doctor.mjs`), with `--online` to verify the key for free.
- **Swappable TTS**: MiniMax by default; Doubao and ElevenLabs adapters included; add your own.
- **Sent to your phone** with any command you configure (Feishu/Lark, Telegram…).
- **Remembers your taste** via a listener profile.

## 📚 Different material, different conversation

| Material | You might say | The episode makes clear | The hosts debate |
|---|---|---|---|
| **Tech** | "Make this AI-tool article into a podcast" | The problem, the core idea (with an analogy), what's better than before | Costs and barriers, who should care, can I use it |
| **Policy** | "Explain this notice as a dialogue, for my parents" | Who issued it, when it takes effect, what changed, who's affected, what to do | Why now, where enforcement may stall, what's unclear |
| **Politics & world** | "This tariff report, under 10 minutes" | What happened, background, what each side says | Whether each side's reasons hold — **without taking sides** |
| **History** | "This chapter on the Hongwu Emperor abolishing the chancellorship" | Dates, people, causes; each year anchored to something familiar | Does the explanation hold, what is and isn't like today |
| **Books & papers** | "Chapter 14 of *Beyond Feelings*" | Core argument, key concepts, examples; sample and method for papers | Where the author is right, where they overreach |
| **Business & finance** | "This earnings report, focus on why profit fell" | Key figures and their basis (vs. last year or last quarter) | Does the reading hold — **no investment advice** |
| **Science & health** | "Explain this study in plain words" | What was found, how strong the evidence is | Should it change daily habits — **no medical advice** |
| **News & opinion** | "This op-ed, argue both sides" | The author's claim and reasons, in their strongest form | Usual objections, missing information |

## 🆚 vs NotebookLM

[NotebookLM](https://notebooklm.google.com/)'s Audio Overviews also turn material into podcasts. Each has strengths:

| | NotebookLM Audio Overview | podcast-maker |
|---|---|---|
| **In mainland China** | Needs access to Google services | Works with China-based MiniMax |
| **Script** | Not editable line by line | Brief and script are files; **edit one line, re-voice one line** |
| **Key facts** | The model decides what to cover | 【】 marks what must be said, **checked one by one** |
| **Approach** | Steer it with a prompt | 8 genre guides + named audience and angle |
| **Voices** | A few fixed AI voices | Pick voices, switch providers, **use your own cloned voice** |
| **QC** | — | 15-point health check + per-line transcription check |
| **Cost** | Free tier with usage limits | Your agent's quota for writing; TTS billed per character (~3,500 for 11 minutes) |
| **Other formats** | Mind maps, flashcards, video and more | Podcast only, plus show notes, quiz and flashcards |

**Want many formats with zero setup? Use NotebookLM. Want accurate Chinese two-host conversations with a script you control? Use podcast-maker.**

## 🔊 Voices and TTS providers

Default: MiniMax `speech-2.8-hd`, "Warm Bestie" as host and "Reliable Executive" as explainer. More presets in `voices.json`, switched with `--voice`. Cloned voices, another provider or auto-sending to Feishu go in `~/.config/podcast-maker/config.json`:

```json
{
  "speakers": { "男": { "voice_id": "your usual male voice ID" } },
  "presets": { "本人": { "男": { "voice_id": "your cloned voice ID" } } },
  "send": ["lark-cli", "im", "+messages-send", "--as", "bot", "--user-id", "<your open_id>", "--file", "{file}"]
}
```

| Provider | Tested? |
|---|---|
| **MiniMax** (default) | Yes, with system and cloned voices; sound tags, emotions, pronunciation dictionary |
| **Doubao** (Volcengine) | Implemented from official docs, **not yet tested** |
| **ElevenLabs** | Implemented from official docs, **not yet tested** |

## 📊 Real-world numbers

Apple Silicon Mac, MiniMax `speech-2.8-hd`, local transcription check included:

| | 30-second sample | Long WeChat article | Topic only (policy) |
|---|---:|---:|---:|
| Material | — | 1 source, ~8,700 chars | 3 sources, ~9,900 chars |
| Brief | ~115 chars, 3 【】 | ~750 chars, 29 【】 | ~600 chars, 20 【】 |
| Script | 7 turns | 122 turns, ~2,800 chars | 74 turns, ~1,600 chars |
| Duration | 0:33 | 10:57 | 6:30 |
| Synthesis + checks | 27 s | ~10 min | ~5.5 min |
| MiniMax billed | ~237 chars | ~3,500 chars | ~2,200 chars |
| Transcription check | 8/8 | 150/150 | 91/91 |

Audio to text: a **76-minute** Xiaoyuzhou episode took **4 min 34 s** to download and transcribe locally, giving ~**22,000** characters.

## ❓ FAQ

<details>
<summary><b>How much does it cost?</b></summary>

Writing uses your agent's own quota; voicing is billed per character by the TTS provider (see the numbers above). The health check and environment check are free.
</details>

<details>
<summary><b>Do I need a Mac?</b></summary>

No. Only two things need Apple Silicon (mlx-whisper): the transcription check after voicing, and audio/video-to-text. Elsewhere the check is skipped automatically; transcribe audio with another tool and hand over the text.
</details>

<details>
<summary><b>Can it make English podcasts?</b></summary>

Not yet — output is Mandarin Chinese. English and other sources are translated first.
</details>

<details>
<summary><b>Can it use my own voice?</b></summary>

Yes. Clone your voice on MiniMax, put the voice ID in a preset in `config.json`, and run with `--voice 本人`.
</details>

<details>
<summary><b>Paywalled articles or members-only videos?</b></summary>

Not bypassed. Export them yourself, download the media, or paste the text.
</details>

<details>
<summary><b>Can I publish the podcasts?</b></summary>

Not recommended. Books and articles remain their authors' copyright; this is for your own listening and learning.
</details>

## 🐛 Troubleshooting

| Symptom | Fix |
|---|---|
| Not sure what's missing | `node scripts/doctor.mjs`, add `--online` to test the key |
| `缺少 MINIMAX_API_KEY` (missing key) | Put it in `~/.config/podcast-maker/.env`; for the international site also set `MINIMAX_API_HOST=https://api.minimax.io` |
| Article extractor exits with 3 or 4 | Blocked or rendered by JavaScript: save the page as HTML in your browser and pass the file to `fetch-article.mjs` |
| Video needs login or membership | Use a public link, or download the file yourself for `fetch-media.mjs` |
| `听写没有返回任何结果` (no transcription results) | Usually proxy settings — read the printed error; `--no-asr` skips the check |
| Some lines "质检没过" (failed QC) | See `.配音/报告.md`; if all 3 takes fail, the line is usually too long or list-heavy — rewrite it and rerun |

## 📂 Repository layout

<details>
<summary><strong>Expand</strong></summary>

| Path | Contents |
|---|---|
| `SKILL.md` | The agent's workflow |
| `references/材料类型/` | Eight genre guides |
| `references/讲给谁听.md` | Default listener, custom audiences and angles |
| `references/对谈稿格式.md` | Interruptions, sound tags, pauses, pronunciation |
| `references/输入源.md` | Reading each source; audio/video, translation, multi-source, topic-only, batch |
| `references/语音服务.md` | Voices, providers, sending to your phone |
| `scripts/podcast-tts.mjs` | Health check + voicing + QC + assembly + chapters, show notes, quiz, flashcards |
| `scripts/fetch-article.mjs` | Web / WeChat extractor with language detection |
| `scripts/fetch-media.mjs` | Audio/video to text: YouTube captions, Xiaoyuzhou, Bilibili, local files |
| `scripts/doctor.mjs` | Environment check |
| `scripts/tts-providers.mjs` | MiniMax, Doubao, ElevenLabs adapters |
| `examples/样片/` | The 30-second sample |
| `voices.json`, `config.example.json`, `.env.example`, `听众档案.example.md` | Default voices and templates |
| `assets/` | Banner, flow diagrams and sources, sample audio |

</details>

## 🙏 Credits

- [wang-h/natural-ai-podcast](https://github.com/wang-h/natural-ai-podcast): multi-pass writing, "un-smooth" interactions, MiniMax sound tags, overlap timeline
- [zarazhangrui/personalized-podcast](https://github.com/zarazhangrui/personalized-podcast): switchable show formats
- [joeseesun/qiaomu-anything-to-notebooklm](https://github.com/joeseesun/qiaomu-anything-to-notebooklm): multi-source input, scenario-style presentation
- [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [FFmpeg](https://ffmpeg.org)

## 📄 License

[MIT License](LICENSE). Books and articles remain their authors' copyright; make podcasts for your own listening, not for publication. Not affiliated with or endorsed by MiniMax, ByteDance, ElevenLabs, Google, Anthropic, OpenAI or any other vendor.

---

<div align="center">

**If it helps, please give it a ⭐ Star!**

</div>
