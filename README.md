<p align="center">
  <img src="assets/banner.png" alt="podcast-maker：丢给它一篇文章，路上听两个人把它聊明白" width="100%">
</p>

<p align="center">
  <b>中文</b> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Agent%20Skill-Claude%20Code%20%7C%20Codex-D9774A" alt="Agent Skill">
  <img src="https://img.shields.io/badge/TTS-MiniMax%20%7C%20豆包%20%7C%20ElevenLabs-3F6B5B" alt="TTS">
  <img src="https://img.shields.io/badge/Node.js-18%2B-1F1B16" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/License-MIT-B9A88F" alt="MIT">
</p>

**podcast-maker** 是一个给 AI Agent 用的 Skill。把一篇公众号文章、一个网页、一篇论文、一份政策文件、一本书的某一章（英文的也行）交给它，它会写成**两个人聊天的中文播客**，配好音，输出 MP3。

开车、走路、做家务的时候听一遍，就知道这篇东西讲了什么、关键数字是多少、值不值得细看。

```text
你：把这篇做成播客 https://mp.weixin.qq.com/s/……

Agent：
  ✓ 取到正文：约 8700 字
  ✓ 精讲稿：5 个核心要点，标了 29 处必须讲到的关键信息
  ✓ 对谈稿：122 个话轮，预计 11 分钟，体检通过，29 处全部讲到
  ✓ 配音：150 句逐句合成、逐句听写复查
  ✓ 输出 MP3：10 分 57 秒，已发到飞书
```

## 为什么做这个

收藏夹里的文章越来越多，真正读完的很少。直接用朗读软件念原文，又干又长，听着听着就走神了。

所以想要的是：**两个人把这篇东西聊一遍**。一个人替你提问、追问、打岔，一个人用大白话讲清楚；核心观点和关键数字一个不漏；聊完还考你两道题。

## 它是怎么做的

| 步骤 | 做什么 | 产出 |
|---|---|---|
| 1. 读材料 | 取网页、公众号正文；读 PDF、Word；外文先全文翻成中文 | `原文.md`（`译文.md`） |
| 2. 精讲稿 | 只留核心：一句话、3～5 个要点、值得聊的地方；用【】标出必须讲到的观点、数字、人名、日期 | `精讲稿.md` |
| 3. 对谈稿 | 改写成两人聊天：开场 → 话题段 → 讨论 → 自测 → 结尾 | `对谈稿.md` |
| 4. 体检 | 不花钱的检查：谁说太多、像不像讲课、太顺、行话、【】有没有漏 | 提示清单 |
| 5. 配音 | 逐句合成 → 质检 → 不合格重来 → 对齐音量 → 按停顿和抢话拼接 | `<标题>.mp3` |

可以停在任何一步：只要精讲稿、只要稿子，或者一直做到 MP3。

## 一段对谈长这样

```markdown
## 开场

女：今天这一期，我们聊一个听起来有点绕的词，叫批判性思维。
男：(emm) 这个词，很多人一听就觉得是，<#0.2#>专门挑别人毛病。
女[抢]：等一下，难道不是吗？批判嘛，不就是批评？
男：(chuckle) 你看，你这个反应就特别典型。它其实不是挑毛病，是在下结论之前，先问自己一句，我凭什么这么认为。
女：哦，所以它是先对着自己的，不是对着别人的。
男[快]：对，先审自己。
```

- `女`、`男` 两个声音，`[抢]` 是抢话（两句话叠在一起），`[快]` 是快接。
- `(emm)` `(chuckle)` `(breath)` 是思考、轻笑、换气的声音，`<#0.2#>` 是句中停顿。
- 自测题后面写一行 `[停 6 秒]`，给你留时间在心里答。

配音前跑一次体检（不调用语音服务，不花钱）：

```text
$ node scripts/podcast-tts.mjs examples/样片 --plan
《样片 声音试听》：7 个话轮，拆成 8 句，约 140 字，预计 0.6 分钟
  女（主持人 · Chinese (Mandarin)_Warm_Bestie）：4 句，75 字
  男（讲解者 · Chinese (Mandarin)_Reliable_Executive）：4 句，65 字
  精讲稿：约 115 个汉字，【】标了 3 处关键信息，对谈里讲到 3 处
  互动：抢话 1，快接 1，声音标记 3（其中笑声 0），自测留白 0
  稿子体检：没发现问题
```

稿子有问题时，体检会直接说哪里要改，比如：

```text
  稿子体检，建议先改再配音：
    · 男说了 66% 的字，像讲课。把一部分内容改成另一个人先猜、先说、复述（目标：不超过 65%）
    · 2 个话轮超过 110 字，听着像独白：……
    · 有行话（听众默认不是专业人士，换成具体说法）：闭环×2、赋能×1
    · 精讲稿里标的这些，对谈稿里没出现：【298】【333】。补进对谈稿……
```

## 特点

**稿子写得像聊天，也讲得清楚**
- **先精讲，再对谈**：精讲稿是能单独看的学习笔记，对谈是它的有声版。
- **关键信息不漏**：精讲稿里用【】标出的观点、数字、人物、日期，体检会逐个检查对谈里有没有说到。
- **默认讲给外行听**：内容可以深，话要浅；专业词先说它是干什么的，再说它叫什么。
- **按材料类型写**：技术、政策文件、时政、历史、书和论文、商业财经、科学健康、新闻观点，各有一份写稿说明：听完要带走什么、哪些信息必须标、怎么讲给外行、哪里容易出错。
- **想怎么讲都行**："讲给我爸妈听""侧重对普通人的影响""从产品经理的角度"，这一期就按这个角度来。
- **有讨论，有自测**：两个人可以意见不同；结尾 2～3 道自测题，每题后留几秒。

**配音听着自然，也靠得住**
- **逐句合成**：一句一合成，抢话、快接、换气、轻笑、自测留白都在时间线上拼出来。
- **逐句质检**：查时长、语速、异常空白、削波，再用本机语音识别把每句听写一遍，和原文对不上的自动重配（每句最多 3 版）。
- **两个声音音量对齐**，最后统一响度导出 MP3。
- **改一句只重配一句**：每句有缓存；换一个人的声音，只重配那个人。

**好接、好换**
- **能读的材料多**：公众号、普通网页（自带正文提取脚本，不依赖第三方库）、PDF、Word、EPUB、直接贴的文字；英文等外文先翻成中文。
- **语音服务可换**：默认 MiniMax（支持克隆声音、声音标记），也内置了豆包和 ElevenLabs 的接入，还能自己加。
- **做完自动发到手机**：配置一条发送命令，飞书、Telegram 都行。
- **给 Agent 用**：Claude Code、Codex 和其他支持 Agent Skills 的工具都能用，用自然语言说就行。

## 快速开始

**1. 装到你的 Agent 里**

```bash
# Claude Code
git clone https://github.com/bingfeng131415/podcast-maker ~/.claude/skills/podcast-maker
# Codex
git clone https://github.com/bingfeng131415/podcast-maker ~/.codex/skills/podcast-maker
# 其他支持 Agent Skills 的工具
git clone https://github.com/bingfeng131415/podcast-maker ~/.agents/skills/podcast-maker
```

需要 Node.js 18 以上和 ffmpeg（macOS：`brew install ffmpeg`）。可选装 [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper)，在 Apple 芯片的 Mac 上做听写复查，没装就自动跳过这一步。

**2. 填语音服务的密钥**

```bash
mkdir -p ~/.config/podcast-maker
cp ~/.claude/skills/podcast-maker/.env.example ~/.config/podcast-maker/.env
# 打开 ~/.config/podcast-maker/.env，填 MINIMAX_API_KEY
```

**3. 对 Agent 说一句话**

- "把这篇做成播客：https://mp.weixin.qq.com/s/……"
- "这份 PDF 的第三章，只要精讲稿"
- "把这个政策文件解读成两个人的对谈，讲给我爸妈听，先不配音"
- "这篇英文博客做成播客，侧重对普通开发者有什么用"
- "男声换成温润那个，重新配一遍"

第一次建议先配一下 `examples/样片`（30 秒，花不了几分钱），听听声音合不合适。

## 能读的材料

| 来源 | 怎么读 |
|---|---|
| 公众号、普通网页 | 自带脚本取正文，去掉菜单和广告；被拦截时改用浏览器取 |
| PDF | 直接读，长的只读指定范围 |
| Word | 先转成文字（macOS 自带 `textutil`，或 `pandoc`） |
| EPUB | 解压后读对应章节 |
| 英文等外文 | 先全文翻成中文（`译文.md`），附人名、术语、数字对照表，再照常做 |
| 直接贴的文字、Markdown | 直接用 |

## 声音和服务商

默认用 MiniMax 的 `speech-2.8-hd`，女声"温暖闺蜜"、男声"沉稳高管"。`voices.json` 里还有几套预设，用 `--voice 预设名` 切换：

```bash
node scripts/podcast-tts.mjs 播客/某一期 --voice 温润
```

想用自己克隆的声音、换服务商、或者每期做完自动发到飞书，在 `~/.config/podcast-maker/config.json` 里配（格式见 `config.example.json`，说明见 `references/语音服务.md`）。

| 服务商 | 状态 |
|---|---|
| MiniMax | 实测可用，支持声音标记、情绪、发音词典、克隆声音 |
| 豆包（火山引擎） | 按公开文档接入，未实测 |
| ElevenLabs | 按公开文档接入，未实测 |

## 实测参考

一期约 11 分钟的节目（一篇约 8700 字的公众号技术文章）：

- 对谈稿约 2800 字，拆成 150 句
- 合成加质检用时约 10 分钟（M 系列 Mac，含本机听写）
- MiniMax 计费约 3500 字（含不合格重配的 7 句）

## 常见问题

**要花多少钱？** 写稿用的是你 Agent 本身的额度；配音按语音服务商的字数计费，参考上面的实测。体检（`--plan`）不花钱。

**没有 Mac 能用吗？** 能。只有听写复查用的 mlx-whisper 需要 Apple 芯片，其他系统会自动跳过这一步。

**能做成英文播客吗？** 现在只做中文播客，外文材料会先翻成中文。

**生成的播客能公开发布吗？** 不建议。书和文章的版权属于原作者，这个工具是做给自己听、帮自己学的。

## 文件

```text
SKILL.md                    给 Agent 看的流程
references/材料类型/          8 类材料的写稿说明
references/讲给谁听.md        默认听众，以及指定听众和角度时怎么写
references/对谈稿格式.md      抢话、声音标记、留白、发音词典
references/输入源.md          各种材料怎么读，外文怎么翻
references/语音服务.md        声音、服务商、发送到手机
scripts/podcast-tts.mjs      体检 + 逐句配音 + 质检 + 拼接
scripts/tts-providers.mjs    语音服务商接入
scripts/fetch-article.mjs    网页 / 公众号正文提取
styles/_模板.md              对谈风格卡模板
examples/样片/               30 秒的示例稿
voices.json                  默认声音和预设
assets/banner.html           封面图的源文件（改完用浏览器截图成 banner.png）
```

## 致谢

写稿方法参考了 [wang-h/natural-ai-podcast](https://github.com/wang-h/natural-ai-podcast)（分遍写稿、"不顺滑互动"、MiniMax 声音标记、抢话时间线）和 [zarazhangrui/personalized-podcast](https://github.com/zarazhangrui/personalized-podcast)（可换节目形式）。

## 许可

[MIT](LICENSE)。用它处理的书籍、文章，版权仍归原作者，生成的播客请自己听，不要公开发布。
