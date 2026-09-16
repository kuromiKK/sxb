"""Build the three original Shangxingbao SVG identity studies. No network needed."""
from pathlib import Path
from html import escape
import json
from mockups import scenes

ROOT = Path(__file__).resolve().parent.parent
BLUE = '#3569E8'
INK = '#182944'
FONT = 'Noto Sans SC'

CONCEPTS = [
    {
        'id': '01-shangxu', 'letter': 'A', 'name': '上序', 'kind': '汉字结构',
        'tagline': '把上行，写进名字。', 'recommended': True,
        'description': '从“上”字提取竖干、短横与基座。两处同向切角带来前进感，留白把学习过程分成清晰的阶段；不用箭头，也能读出“上行”。',
        'fit': '名称关联最直接，形状简洁，适合作为长期主品牌和小程序图标。',
        'tradeoff': '刻意保留汉字骨架，气质偏理性；若希望更有陪伴感，可选 C 方向。',
        'paths': [
            ('upper-structure', 'M108 164V54Q108 48 114 48H142V98H202L182 130H142V164Z'),
            ('foundation', 'M48 184H208L188 216H48Z'),
        ],
        'logic': ['“上”字骨架', '阶段留白', '同向切角'],
    },
    {
        'id': '02-xingdai', 'letter': 'B', 'name': '行带', 'kind': '字母负空间',
        'tagline': '学过的，连成自己的。', 'recommended': False,
        'description': '以 SXB 的首字母 S 为骨架，将上下两段学习路径连成一条连续带。斜向负空间与端部切角呼应“行”，不勉强拼入 X、B。',
        'fit': '轮廓紧凑，偏数字工具气质，适合独立图标、学习进度和动态延展。',
        'tradeoff': '与中文名称的联系较间接，初期需要配合“上行宝”文字一起使用。',
        'paths': [
            ('continuous-s-ribbon', 'M192 40H104C71 40 48 62 48 94C48 116 59 130 80 142L155 184H64L44 216H156C188 216 212 193 212 162C212 140 200 124 178 112L101 72H172Z'),
        ],
        'logic': ['S 字母骨架', '连续学习带', '斜向负空间'],
    },
    {
        'id': '03-zhizhan', 'letter': 'C', 'name': '知展', 'kind': '知识路径',
        'tagline': '知识展开，能力生长。', 'recommended': False,
        'description': '两片错位展开的曲面像翻开的知识页，也像逐渐舒展的双翼。中间保留向上敞开的通道，表达从理解知识到独立运用的过程。',
        'fit': '更温和、有陪伴感，适合课程学习与备考服务，也能独立用于头像。',
        'tradeoff': '书页与生长意象更普遍，名称专属性不如 A；曲线是这一方向的主要记忆点。',
        'paths': [
            ('first-knowledge-page', 'M118 214C69 193 44 150 44 72C85 75 118 106 118 159Z'),
            ('unfolding-knowledge-page', 'M138 214V146C138 96 168 57 212 40C217 121 192 180 138 214Z'),
        ],
        'logic': ['展开的知识页', '错位生长', '开放学习通道'],
    },
]


def geometry(c):
    return '\n'.join(f'    <path id="{name}" d="{d}"/>' for name, d in c['paths'])


def svg(c, color=BLUE, lockup=False):
    title = f"上行宝 · {c['name']} · {'图文组合' if lockup else '图形标'}"
    viewbox = '0 0 620 256' if lockup else '0 0 256 256'
    wordmark = ''
    if lockup:
        wordmark = f'''\n  <g id="wordmark" fill="{INK if color == BLUE else color}">
    <text x="270" y="170" font-family="Noto Sans SC, Microsoft YaHei, sans-serif" font-size="98" font-weight="700" letter-spacing="4">上行宝</text>
  </g>'''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-labelledby="title description">
  <title id="title">{title}</title>
  <desc id="description">原创路径图形。{c['description']}{' 文字为可编辑文本，使用 Noto Sans SC Bold，未转曲。' if lockup else ''}</desc>
  <g id="symbol" fill="{color}">
{geometry(c)}
  </g>{wordmark}
</svg>
'''


def inline(c, size=128, cls='', label=True):
    attrs = f'role="img" aria-label="{c["name"]}图形标"' if label else 'aria-hidden="true"'
    paths = ''.join(f'<path d="{d}"/>' for _, d in c['paths'])
    return f'<svg class="mark {cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="{size}" height="{size}" fill="currentColor" {attrs}>{paths}</svg>'


def application_previews(c):
    physical = ''.join(f'''<figure class="scene physical-scene" id="{c['id']}-{slug}"><figcaption><span>{i:02d} / {label}</span><a href="{c['id']}/applications/{slug}.svg" download aria-label="下载{c['name']}{label}场景 SVG">{detail} · SVG ↓</a></figcaption><img src="{c['id']}/applications/{slug}.svg" width="400" height="280" alt="{c['name']}方案的{label}品牌应用示意" loading="lazy"></figure>''' for i,(slug,label,detail,_) in enumerate(scenes(c),4))
    return f'''
      <section class="concept-applications" id="{c['id']}-applications" aria-labelledby="{c['id']}-applications-title">
        <div class="check-label"><h4 id="{c['id']}-applications-title">应用展示</h4><span>品牌色场景示意</span></div>
        <div class="scene-stack">
          <figure class="scene">
            <figcaption><span>01 / APP 图标</span><span>桌面图标</span></figcaption>
            <div class="scene-app"><div class="scene-app-icon">{inline(c,80,label=False)}</div><div><strong>上行宝</strong><p>清晰备考，稳步向上。</p></div></div>
          </figure>
          <figure class="scene">
            <figcaption><span>02 / 官网 Logo</span><span>横排组合</span></figcaption>
            <div class="scene-web"><div class="scene-browser" aria-hidden="true"><i></i><i></i><i></i><span>上行宝 · 全链路备考</span></div><div class="scene-web-nav"><div class="scene-brand">{inline(c,34,label=False)}<strong>上行宝</strong></div><span>学习中心</span></div><p>把知识学懂，把每一道题做会。</p></div>
          </figure>
          <figure class="scene scene-poster-panel">
            <figcaption><span>03 / 海报 Logo</span><span>品牌宣传</span></figcaption>
            <div class="scene-poster"><div class="scene-brand">{inline(c,32,label=False)}<strong>上行宝</strong></div><p class="poster-kicker">全链路备考 · 让进步有迹可循</p><p class="poster-headline">每一步，<br>都向上。</p><div class="poster-footer"><span>知识 · 练习 · 掌握</span><span>SHANGXINGBAO</span></div><div class="poster-watermark" aria-hidden="true">{inline(c,210,label=False)}</div></div>
          </figure>
          {physical}
        </div>
        <p class="scene-note">实物为矢量效果示意，文字待定；确认尺寸与材质后可制作印刷稿。</p>
      </section>'''


ROOT.mkdir(parents=True, exist_ok=True)
for c in CONCEPTS:
    dest = ROOT / c['id']
    dest.mkdir(exist_ok=True)
    (dest / 'applications').mkdir(exist_ok=True)
    for slug, _, _, artwork in scenes(c):
        (dest / 'applications' / f'{slug}.svg').write_text(artwork, encoding='utf-8')
    for name, color, lockup in [
        ('mark.svg', BLUE, False), ('mark-black.svg', '#000000', False),
        ('mark-white.svg', '#FFFFFF', False), ('lockup.svg', BLUE, True),
        ('lockup-black.svg', '#000000', True), ('lockup-white.svg', '#FFFFFF', True),
    ]:
        (dest / name).write_text(svg(c, color, lockup), encoding='utf-8')

(ROOT / 'concepts.json').write_text(json.dumps(CONCEPTS, ensure_ascii=False, indent=2), encoding='utf-8')

cards = []
for c in CONCEPTS:
    recommended = '<span class="recommend">优先推荐</span>' if c['recommended'] else ''
    sizes = ''.join(f'<div class="size-sample">{inline(c, size)}<span>{size} px</span></div>' for size in [24,48,128])
    logic = ''.join(f'<span>{text}</span>' for text in c['logic'])
    cards.append(f'''
    <article class="concept" id="{c['id']}">
      <div class="concept-heading"><span class="index">{c['letter']} / 0{len(cards)+1}</span>{recommended}<span class="category">{c['kind']}</span></div>
      <div class="identity-surface hero-mark">{inline(c,160)}<span class="wordmark">上行宝</span></div>
      <div class="concept-copy"><h3>{c['name']}<span>{c['tagline']}</span></h3><p>{c['description']}</p><div class="logic">{logic}</div></div>
      <div class="lockup-section"><div class="check-label">横排组合 <span>独立图形 + 可编辑文字</span></div><div class="lockup-preview identity-surface"><img data-lockup="{c['id']}" src="{c['id']}/lockup.svg" width="620" height="256" alt="{c['name']}横排图文组合"></div></div>
      <div class="check-label">小尺寸检查 <span>按实际 CSS 像素显示</span></div>
      <div class="sizes identity-surface">{sizes}</div>
      {application_previews(c)}
      <div class="mono-row"><div class="mono black">{inline(c,76)}<span>纯黑</span></div><div class="mono white">{inline(c,76)}<span>反白</span></div></div>
      <details><summary>适用场景与取舍</summary><p>{c['fit']}</p><p>{c['tradeoff']}</p></details>
      <div class="downloads"><a href="{c['id']}/mark.svg" download>图形 SVG <span aria-hidden="true">↓</span></a><a href="{c['id']}/lockup.svg" download>图文 SVG <span aria-hidden="true">↓</span></a></div>
    </article>''')

page = '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>上行宝 · Logo 设计提案</title>
<style>
:root{--blue:#3569e8;--ink:#182944;--muted:#606a77;--paper:#f5f4ef;--line:#dcdedb;--white:#fff;--surface:#fafbf9;--preview-color:var(--blue);--preview-ink:var(--ink);--preview-bg:#f1f4fb}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:24px}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;line-height:1.65}button,a{-webkit-tap-highlight-color:transparent}button{font:inherit;cursor:pointer}a{color:inherit;text-decoration:none}a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid var(--blue);outline-offset:4px}button,a,summary{touch-action:manipulation}svg{display:block;flex-shrink:0}::selection{background:#dbe5ff}.wrap{width:min(1320px,calc(100% - 96px));margin:auto}.topbar{height:88px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);gap:20px}.brand{font-weight:700;display:flex;align-items:center;gap:12px;font-size:18px;letter-spacing:.05em}.brand .mark{color:var(--blue)}.topbar nav{display:flex;gap:28px;color:var(--muted);font-size:13px}.topbar nav a{display:flex;align-items:center;min-height:44px}.topbar nav a:hover{color:var(--blue)}.hero{padding:60px 0 44px;display:grid;grid-template-columns:1.35fr 1fr;gap:64px;align-items:end}.eyebrow{font-family:Arial,sans-serif;font-size:11px;letter-spacing:.19em;color:var(--muted);font-weight:700;margin:0 0 18px}.hero h1{font-size:clamp(34px,4.6vw,64px);font-weight:700;line-height:1.22;letter-spacing:-.045em;margin:0}.hero h1 em{font-style:normal;color:var(--blue)}.hero-note{max-width:420px}.hero-note p{font-size:14px;color:var(--muted);margin:0 0 20px}.meta{display:flex;gap:8px;flex-wrap:wrap}.meta span{font-size:11px;border:1px solid #ccd1d7;border-radius:3px;padding:4px 9px}.toolbar{padding:20px 0 24px;display:flex;align-items:center;justify-content:space-between;gap:20px;border-top:1px solid var(--line)}.toolbar h2{font-size:17px;font-weight:600;margin:0}.toolbar h2 small{font:11px Arial,sans-serif;margin-left:16px;color:var(--muted);letter-spacing:.08em}.switch{display:flex;gap:3px;padding:4px;background:#e8e9e5;border-radius:7px}.switch button{border:0;border-radius:4px;min-height:40px;padding:0 16px;font-size:12px;color:var(--muted);background:none}.switch button[aria-pressed="true"]{background:var(--white);color:var(--ink);font-weight:700}.concepts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.concept{min-width:0;border:1px solid var(--line);background:var(--white);border-radius:5px;overflow:hidden}.concept-heading{display:flex;align-items:center;height:54px;padding:0 22px;gap:10px}.index{font:11px Arial,sans-serif;letter-spacing:.12em}.recommend{background:#ebf1ff;color:#214dac;font-size:10px;font-weight:600;padding:3px 7px;border-radius:2px}.category{margin-left:auto;font-size:11px;color:var(--muted)}.identity-surface{background:var(--preview-bg);color:var(--preview-color)}.hero-mark{height:282px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;margin:0 12px}.wordmark{font-size:35px;font-weight:700;letter-spacing:.12em;text-indent:.12em;color:var(--preview-ink)}.concept-copy{padding:24px 22px 22px}.concept-copy h3{font-size:25px;font-weight:600;letter-spacing:.05em;margin:0 0 13px;display:flex;align-items:center;gap:12px}.concept-copy h3 span{font-size:11px;letter-spacing:0;font-weight:400;color:var(--muted)}.concept-copy p{font-size:13px;color:#546171;line-height:1.95;margin:0;min-height:104px}.logic{display:flex;gap:7px;flex-wrap:wrap;margin-top:17px}.logic span{font-size:10px;border-bottom:1px solid #cdd6e7;padding-bottom:3px;color:#596a84}.check-label{font-size:11px;display:flex;justify-content:space-between;padding:0 22px 12px}.check-label span{font-size:10px;color:var(--muted)}.sizes{background:var(--preview-bg);margin:0 12px;min-height:178px;display:flex;justify-content:space-evenly;align-items:flex-end;padding:16px 6px 14px;gap:5px}.size-sample{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:7px}.size-sample span{font:10px Arial,sans-serif;color:var(--preview-ink)}.mono-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 12px 0}.mono{display:flex;align-items:center;justify-content:center;gap:6px;min-height:96px}.mono span{font-size:10px}.mono.black{background:#f3f3f1;color:#000}.mono.white{background:#182944;color:white}.concept details{margin:15px 22px 0;font-size:12px}.concept summary{cursor:pointer;min-height:44px;display:flex;align-items:center;justify-content:space-between;list-style:none}.concept summary::after{content:'+';font-size:20px;font-weight:400}.concept details[open] summary::after{content:'−'}.concept details p{color:var(--muted);font-size:12px;margin:0 0 12px;line-height:1.8}.downloads{display:flex;gap:12px;margin:0 22px 18px;border-top:1px solid var(--line);padding-top:10px}.downloads a{flex:1;display:flex;justify-content:space-between;align-items:center;min-height:44px;font-size:12px}.downloads a:hover{color:var(--blue)}.application{padding:60px 0 0}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:22px}.section-heading h2{font-size:23px;margin:0 0 4px;font-weight:600}.section-heading p{font-size:12px;margin:0;color:var(--muted)}.app-layout{display:grid;grid-template-columns:1.8fr 1fr;gap:20px}.web-mock{background:var(--white);border:1px solid var(--line);border-radius:5px;overflow:hidden}.mock-nav{padding:16px 28px;border-bottom:1px solid #e8ebf0;display:flex;align-items:center;justify-content:space-between}.mock-brand{display:flex;align-items:center;gap:7px;font-size:19px;letter-spacing:.05em;font-weight:700}.mock-brand svg{color:var(--blue)}.mock-links{font-size:11px;color:var(--muted);display:flex;gap:22px}.mock-main{padding:32px 38px;display:flex;justify-content:space-between;gap:20px}.mock-content>span{font-size:11px;color:var(--blue)}.mock-main h3{font-size:30px;line-height:1.55;margin:12px 0 14px;letter-spacing:-.04em}.mock-main p{font-size:11px;color:var(--muted);margin:0}.mock-plan{align-self:flex-end;border-left:1px solid var(--line);padding-left:25px;min-width:114px;color:var(--muted);font-size:11px}.mock-plan strong{display:block;font:700 42px Arial,sans-serif;color:var(--blue);margin:10px 0}.mock-plan strong small{font:12px "Noto Sans SC",sans-serif;margin-left:5px}.app-icon-panel{background:#e8edf9;border:1px solid #d8dfef;border-radius:5px;display:flex;align-items:center;justify-content:center;gap:28px;padding:26px}.app-tile{width:132px;height:132px;background:var(--blue);color:white;border-radius:29px;display:grid;place-items:center}.app-tile svg{width:128px;height:128px}.app-icon-panel strong{font-size:17px;letter-spacing:.06em}.app-icon-panel p{font-size:11px;color:#53627e;margin:8px 0}.notes{padding:56px 0 40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px}.notes h3{font-size:13px;margin:0 0 12px}.notes p{font-size:12px;line-height:1.9;color:var(--muted);margin:0}.swatches{display:flex;gap:15px;margin-top:14px}.swatch{font:10px Arial,sans-serif;display:flex;align-items:center;gap:6px;color:var(--muted)}.swatch i{width:13px;height:13px;border-radius:50%}footer{border-top:1px solid var(--line);padding:20px 0 36px;font-size:10px;letter-spacing:.08em;color:var(--muted);display:flex;justify-content:space-between;gap:16px}footer a:hover{color:var(--blue)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}body[data-mode="black"]{--preview-color:#000;--preview-ink:#000;--preview-bg:#f4f4f2}body[data-mode="reverse"]{--preview-color:#fff;--preview-ink:#fff;--preview-bg:#182944}
@media(min-width:1600px){.concept-copy p{min-height:78px}}@media(max-width:1100px){.wrap{width:calc(100% - 48px)}.concepts{gap:12px}.concept-copy,.concept-heading{padding-left:16px;padding-right:16px}.concept-copy h3{display:block}.concept-copy h3 span{display:block;margin-top:6px}.concept-copy p{min-height:132px}.sizes{gap:0}.size-sample:nth-child(3) svg{width:128px;height:128px}.check-label{padding:0 16px 10px;flex-direction:column;gap:3px}.app-layout{grid-template-columns:1.6fr 1fr}.app-icon-panel{gap:16px;flex-direction:column;text-align:center}.app-icon-panel p{margin:3px 0}.mock-main{padding:28px}.mock-links{gap:12px}.hero{gap:28px}.notes{gap:24px}}@media(max-width:820px){.concepts{grid-template-columns:1fr;gap:20px}.concept{display:grid;grid-template-columns:1fr 1fr}.concept-heading{grid-column:1/-1}.hero-mark{margin:0 0 0 12px;min-height:282px;height:100%}.concept-copy{align-self:center}.concept-copy p{min-height:0}.check-label{grid-column:1/-1;flex-direction:row;padding:20px 22px 10px}.sizes{margin-right:0;min-height:170px}.mono-row{margin-top:0;grid-template-columns:1fr;gap:8px}.mono{min-height:80px}.concept details,.downloads{grid-column:1/-1}.hero{grid-template-columns:1fr;padding:40px 0 32px;gap:26px}.hero-note{max-width:600px}.hero-note p{margin-bottom:15px}.app-layout{grid-template-columns:1fr}.app-icon-panel{flex-direction:row;text-align:left;justify-content:flex-start;padding-left:38px}.notes{grid-template-columns:1fr;gap:26px}.mock-main h3{font-size:28px}}@media(max-width:480px){.wrap{width:calc(100% - 32px)}.topbar{height:72px}.topbar nav{gap:16px;font-size:11px}.brand{font-size:16px;gap:6px}.brand .mark{width:27px;height:27px}.topbar nav a:last-child{display:none}.hero h1{font-size:38px}.eyebrow{font-size:9px;letter-spacing:.13em}.hero-note p{font-size:13px}.toolbar{align-items:flex-start;flex-direction:column;gap:14px}.toolbar h2 small{margin-left:10px}.switch{width:100%}.switch button{flex:1;min-height:44px}.concept{display:block}.concept-heading{height:54px}.hero-mark{margin:0 12px;height:280px}.concept-copy{padding:23px 22px}.concept-copy h3{display:flex}.concept-copy h3 span{margin:0;font-size:10px}.concept-copy p{font-size:13px}.check-label{padding-top:4px}.sizes{margin:0 12px}.mono-row{margin:8px 12px 0;grid-template-columns:1fr 1fr}.mono{min-height:96px}.section-heading{align-items:flex-start;flex-direction:column}.application{padding-top:38px}.mock-nav{padding:14px 15px}.mock-brand{font-size:17px}.mock-links{gap:10px;font-size:10px}.mock-links span:last-child{display:none}.mock-main{padding:25px 20px;flex-direction:column}.mock-main h3{font-size:27px}.mock-plan{display:flex;align-items:center;gap:14px;align-self:stretch;min-width:0;border-left:0;border-top:1px solid var(--line);padding:13px 0 0}.mock-plan strong{font-size:28px;margin:0}.mock-plan>span:last-child{margin-left:auto}.app-icon-panel{padding:28px;gap:23px}.app-tile{width:104px;height:104px;border-radius:24px}.app-tile svg{width:104px;height:104px}.notes{padding-top:36px}footer{flex-direction:column;gap:5px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{.wrap{width:100%}.topbar nav,.switch,.downloads{display:none}.concepts{grid-template-columns:repeat(3,1fr)}.concept{display:block;break-inside:avoid}.hero{padding:24px 0}.hero h1{font-size:36px}.hero-mark{height:230px}.application,.notes{break-inside:avoid}.concept-copy p{min-height:110px}.app-layout{grid-template-columns:1.8fr 1fr}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.lockup-section{grid-column:1/-1;margin-bottom:20px}.lockup-preview{margin:0 12px;padding:6px 12px;display:flex;align-items:center;justify-content:center}.lockup-preview img{display:block;width:min(100%,290px);height:auto}.lockup-section .check-label{padding-top:0}
.concept-applications{grid-column:1/-1;min-width:0;padding-top:24px;margin-bottom:16px;scroll-margin-top:24px}.concept-applications .check-label{padding-top:0}.concept-applications h4{font:inherit;margin:0}.scene-stack{display:grid;gap:12px;margin:0 12px}.scene{margin:0;min-width:0;border:1px solid #e2e6ef;border-radius:4px;overflow:hidden}.scene figcaption{display:flex;justify-content:space-between;gap:8px;padding:9px 12px;font-size:10px;background:#fff;color:var(--ink);border-bottom:1px solid #e2e6ef}.scene figcaption span:last-child{color:var(--muted)}.scene-app{display:flex;align-items:center;justify-content:center;gap:24px;padding:22px 16px;background:#edf1fa;min-height:128px}.scene-app-icon{width:80px;height:80px;flex-shrink:0;border-radius:18px;background:var(--blue);color:#fff;display:grid;place-items:center;box-shadow:0 6px 12px #18294412}.scene-app strong{font-size:17px;letter-spacing:.08em}.scene-app p{font-size:10px;color:#53627e;margin:6px 0 0}.scene-web{background:#fff;min-height:128px}.scene-browser{display:flex;align-items:center;gap:4px;padding:9px 12px;background:#f5f6f8}.scene-browser i{width:5px;height:5px;border-radius:50%;background:#c9d0db}.scene-browser>span{margin-left:8px;font-size:9px;color:#69758a}.scene-web-nav{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px 8px}.scene-brand{display:flex;align-items:center;gap:5px}.scene-brand strong{font-size:17px;letter-spacing:.06em}.scene-web .mark{color:var(--blue)}.scene-web-nav>span{font-size:10px;color:#606a77}.scene-web>p{margin:0;padding:0 16px 16px;font-size:11px;color:#53627e}.scene-poster{position:relative;isolation:isolate;overflow:hidden;min-height:276px;padding:22px;background:var(--blue);color:#fff}.scene-poster .scene-brand strong{font-size:15px}.poster-kicker{font-size:10px;margin:18px 0 8px;color:#e3ebff;position:relative;z-index:1}.poster-headline{position:relative;z-index:1;font-size:36px;font-weight:700;line-height:1.4;letter-spacing:.02em;margin:0 0 25px}.poster-footer{position:relative;z-index:1;border-top:1px solid #ffffff45;padding-top:10px;display:flex;justify-content:space-between;gap:8px;font-size:9px;color:#e3ebff}.poster-footer>span:last-child{font:8px Arial,sans-serif;letter-spacing:.08em;align-self:center}.poster-watermark{position:absolute;right:-25px;bottom:30px;z-index:0;color:#fff;opacity:.09;transform:rotate(-10deg);pointer-events:none}
.physical-scene img{display:block;width:100%;height:auto}.physical-scene{scroll-margin-top:24px}.scene figcaption a{color:#53627e;text-decoration:underline;text-underline-offset:3px;min-height:44px;display:flex;align-items:center}.physical-scene figcaption{padding:0 12px;align-items:center}.scene figcaption a:hover{color:var(--blue)}.scene-note{font-size:11px;color:var(--muted);line-height:1.8;margin:12px 22px 0}
@media(min-width:481px) and (max-width:820px){.concept>.sizes{grid-column:1/-1;margin:0 12px}.concept>.mono-row{grid-column:1/-1;grid-template-columns:1fr 1fr}.scene-stack{grid-template-columns:1fr 1fr}.scene-poster-panel,.scene:last-child{grid-column:1/-1}.scene-poster{min-height:270px}.scene-app{gap:16px}.scene-app p{max-width:100px}.concept-applications .check-label{padding-top:0}}
</style></head>
<body data-mode="brand"><div class="wrap">
<header class="topbar"><a class="brand" href="#top" aria-label="上行宝设计提案首页">__BRAND__<span>上行宝</span></a><nav aria-label="页面导航"><a href="#concepts">方案对比</a><a href="#applications">应用预览</a><a href="#notes">设计说明</a></nav></header>
<main id="top"><section class="hero"><div><p class="eyebrow">SHANGXINGBAO / IDENTITY STUDY / 01</p><h1>每一步，<em>都向上。</em></h1></div><div class="hero-note"><p>为全链路备考打造清晰、可靠的品牌识别。三个不同结构，从名字、学习过程与知识展开出发，让进步有迹可循。</p><div class="meta"><span>职业资格备考</span><span>知识 · 练习 · 掌握</span><span>原创 SVG 提案</span></div></div></section>
<section id="concepts" aria-labelledby="compare-title"><div class="toolbar"><h2 id="compare-title">三个方向，同一份向上。<small>01 — 03</small></h2><div class="switch" role="group" aria-label="方案展示颜色"><button type="button" data-mode="brand" aria-pressed="true">品牌蓝</button><button type="button" data-mode="black" aria-pressed="false">黑白</button><button type="button" data-mode="reverse" aria-pressed="false">反白</button></div></div><div class="concepts">__CARDS__</div></section>
<section class="application" id="applications" aria-labelledby="application-title"><div class="section-heading"><div><h2 id="application-title">放进真实使用场景。</h2><p>基于现有产品内容的静态示意 · 可切换方案比较</p></div><div class="switch" role="group" aria-label="应用预览方案">__OPTIONS__</div></div>
<div class="app-layout"><div class="web-mock"><div class="mock-nav"><div class="mock-brand"><span id="nav-mark">__NAV_MARK__</span><span>上行宝</span></div><div class="mock-links"><span>知识图谱</span><span>智能刷题</span><span>我的学习</span></div></div><div class="mock-main"><div class="mock-content"><span>上行宝 · 全链路备考</span><h3>把知识学懂，<br>把每一道题做会。</h3><p>一套清晰路径，陪你完成整场考试。</p></div><div class="mock-plan"><span>今日学习计划</span><strong>20<small>题</small></strong><span>一步一步，更有把握</span></div></div></div><div class="app-icon-panel"><div class="app-tile" id="app-mark">__APP_MARK__</div><div><strong>上行宝</strong><p>小程序 / App 图标示意</p><p id="active-concept">A · 上序</p></div></div></div><p class="sr-only" id="selection-status" aria-live="polite"></p></section>
<section class="notes" id="notes"><div><h3>建议主方向 / A · 上序</h3><p>名字本身就是最直接的记忆入口。“上”字结构在小尺寸仍然成立，也能延续现有系统稳重、清晰的蓝色识别。B 更偏数字工具，C 更偏学习陪伴。</p></div><div><h3>颜色与字体</h3><p>沿用用户端与管理组件的 #3569E8。中文使用本机 Noto Sans SC Bold，图文 SVG 保留可编辑文本，未转曲；换设备时需安装该字体。</p><div class="swatches"><span class="swatch"><i style="background:#3569e8"></i>#3569E8</span><span class="swatch"><i style="background:#182944"></i>#182944</span></div></div><div><h3>交付与使用</h3><p>每个方向含图形与横排组合，各有品牌色、纯黑、反白三版。SVG 无嵌入图片，可直接编辑路径；24 / 48 / 128 px 栏为图形标实际尺寸。深色方块仅为预览背景。</p></div></section>
</main><footer><span>上行宝 / 品牌识别设计提案 · 2026.09</span><a href="README.md">查看文件说明与设计依据 ↗</a></footer></div>
<script>
const marks=__MARKS__;
document.querySelectorAll('button[data-mode]').forEach(button=>button.addEventListener('click',()=>{const mode=button.dataset.mode;document.body.dataset.mode=mode;document.querySelectorAll('button[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('img[data-lockup]').forEach(img=>img.src=img.dataset.lockup+'/lockup'+(mode==='black'?'-black':mode==='reverse'?'-white':'')+'.svg');}));
document.querySelectorAll('button[data-concept]').forEach(button=>button.addEventListener('click',()=>{const c=marks[button.dataset.concept];document.getElementById('nav-mark').innerHTML=c.small;document.getElementById('app-mark').innerHTML=c.large;document.getElementById('active-concept').textContent=c.label;document.getElementById('selection-status').textContent='应用预览已切换为 '+c.label;document.querySelectorAll('button[data-concept]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
</script></body></html>'''

options = ''.join(f'<button type="button" data-concept="{c["id"]}" aria-pressed="{str(i==0).lower()}">{c["letter"]} · {c["name"]}</button>' for i,c in enumerate(CONCEPTS))
marks = {c['id']: {'small':inline(c,36,label=False),'large':inline(c,128,label=False),'label':c['letter']+' · '+c['name']} for c in CONCEPTS}
for placeholder, value in {
    '__BRAND__':inline(CONCEPTS[0],32,label=False), '__CARDS__':'\n'.join(cards),
    '__OPTIONS__':options, '__NAV_MARK__':inline(CONCEPTS[0],36,label=False),
    '__APP_MARK__':inline(CONCEPTS[0],128,label=False), '__MARKS__':json.dumps(marks,ensure_ascii=False),
}.items(): page=page.replace(placeholder,value)
(ROOT/'index.html').write_text(page,encoding='utf-8')
print('Built 18 identity SVGs, 15 application SVGs, offline preview and concept metadata:', ROOT)
