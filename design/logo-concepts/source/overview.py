"""Make a shareable comparison board from the actual SVG renders."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent.parent
FONT=Path('C:/Windows/Fonts/Noto Sans SC (TrueType).otf')
BOLD=Path('C:/Windows/Fonts/Noto Sans SC Bold (TrueType).otf')
INK='#182944'; BLUE='#3569E8'; MUTED='#606A77'; PAPER='#F5F4EF'
S=2
canvas=Image.new('RGB',(1600*S,1120*S),PAPER)
d=ImageDraw.Draw(canvas)

def font(size,bold=False):return ImageFont.truetype(str(BOLD if bold else FONT),round(size*S))
def text(x,y,s,size=16,fill=INK,bold=False):d.text((x*S,y*S),s,font=font(size,bold),fill=fill,anchor='lt')
def box(coords,fill,outline=None,radius=0):
    if radius:d.rounded_rectangle(tuple(v*S for v in coords),radius=radius*S,fill=fill,outline=outline,width=S)
    else:d.rectangle(tuple(v*S for v in coords),fill=fill,outline=outline,width=S)
def line(coords,fill='#DCDEDB'):d.line(tuple(v*S for v in coords),fill=fill,width=S)
def mark(c,x,y,size,color=BLUE):
    src=Image.open(ROOT/c['id']/'mark-1024.png').convert('RGBA')
    alpha=src.getchannel('A')
    layer=Image.new('RGBA',src.size,color);layer.putalpha(alpha)
    layer=layer.resize((int(size*S),int(size*S)),Image.Resampling.LANCZOS)
    canvas.paste(layer,(int(x*S),int(y*S)),layer)
def center(x,y,s,size=16,fill=INK,bold=False):
    f=font(size,bold);width=d.textlength(s,font=f)/S;text(x-width/2,y,s,size,fill,bold)

concepts=json.loads((ROOT/'concepts.json').read_text(encoding='utf-8'))
text(64,40,'SHANGXINGBAO  /  IDENTITY STUDY',14,MUTED)
text(64,85,'每一步，都向上。',54,INK,True)
text(1010,98,'上行宝 · 全链路备考',20,INK,True)
text(1010,135,'三个原创矢量方向 / 品牌识别设计提案',15,MUTED)
line([64,185,1536,185])
for i,c in enumerate(concepts):
    x=64+i*498; w=476
    box([x,215,x+w,995],'#FFFFFF','#DCDEDB',4)
    text(x+24,237,f"{c['letter']} / 0{i+1}",13,MUTED)
    text(x+w-128,237,c['kind'],13,MUTED)
    box([x+12,276,x+w-12,591],'#F1F4FB')
    mark(c,x+(w-202)/2,286,202)
    center(x+w/2,505,'上行宝',42,INK,True)
    text(x+24,618,c['name'],29,INK,True)
    text(x+106,633,c['tagline'],15,MUTED)
    if i==0:
        box([x+w-94,611,x+w-24,637],'#EBF1FF',radius=3)
        text(x+w-84,617,'优先推荐',12,'#214DAC',True)
    text(x+24,671,' / '.join(c['logic']),13,MUTED)
    line([x+24,710,x+w-24,710])
    text(x+24,731,'图形尺寸',12,MUTED)
    for px,sz in [(x+53,24),(x+153,48),(x+303,128)]:
        mark(c,px-sz/2,888-sz,sz)
        center(px,899,f'{sz} px',12,MUTED)
    box([x+24,940,x+225,978],'#F4F4F2',radius=3)
    mark(c,x+39,942,34,'#000000');text(x+85,950,'纯黑版',12,'#000000')
    box([x+237,940,x+w-24,978],INK,radius=3)
    mark(c,x+252,942,34,'#FFFFFF');text(x+298,950,'反白版',12,'#FFFFFF')
text(64,1030,'主色 #3569E8  ·  中文 Noto Sans SC Bold  ·  SVG 图形为真实路径，文字保留可编辑文本',14,MUTED)
text(64,1066,'A 名称识别更直接    /    B 数字工具感更强    /    C 学习陪伴感更温和',14,INK)
canvas.resize((1600,1120),Image.Resampling.LANCZOS).save(ROOT/'overview.png')
print(ROOT/'overview.png')
