"""Editable SVG application studies; dimensions are mockup canvas units, not print specs."""
from html import escape

BLUE = '#3569E8'
INK = '#182944'


def mark(c, x, y, size, color=BLUE):
    paths = ''.join(f'<path d="{d}"/>' for _, d in c['paths'])
    return f'<g transform="translate({x} {y}) scale({size/256})" fill="{color}">{paths}</g>'


def text(x, y, value, size=12, color=INK, weight=400, extra=''):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" {extra}>{escape(value)}</text>'


def brand(c, x, y, size=25, color=BLUE, wordcolor=INK):
    return mark(c,x,y,size,color)+text(x+size+3,y+size*.72,'上行宝',size*.49,wordcolor,700)


def scenes(c):
    card = f'''
    <g transform="translate(43 34) rotate(-7 130 65)">
      <rect x="3" y="6" width="247" height="137" rx="3" fill="#18294412"/>
      <rect width="247" height="137" rx="3" fill="{BLUE}"/>
      {brand(c,22,22,34,'#fff','#fff')}
      {text(26,103,'每一步，都向上。',15,'#fff',700)}
      {text(26,121,'SHANGXINGBAO',7,'#dce7ff',400,extra='letter-spacing="2"')}
    </g>
    <g transform="translate(107 116) rotate(5 124 68)">
      <rect x="3" y="5" width="247" height="137" rx="3" fill="#18294412"/>
      <rect width="247" height="137" rx="3" fill="#fff"/>
      <rect width="5" height="137" fill="{BLUE}"/>
      {text(23,34,'姓名 / 职务',17,INK,700)}
      {text(23,57,'上行宝 · 全链路备考',10,'#606a77')}
      <path d="M23 73H223" stroke="#e4e8ef"/>
      {text(23,95,'电话：待补充',10,'#606a77')}
      {text(23,115,'邮箱：待补充',10,'#606a77')}
      {mark(c,189,87,36)}
    </g>'''

    cup = f'''
    <ellipse cx="202" cy="246" rx="107" ry="11" fill="#1829440d"/>
    <g transform="translate(16 5) rotate(-9 115 140)">
      <path d="M67 69L82 221Q119 237 156 221L172 69Z" fill="#fff" stroke="#d8dfeb"/>
      <path d="M72 97L78 146Q120 156 166 146L171 97Z" fill="{BLUE}"/>
      {brand(c,88,110,25,'#fff','#fff')}
      {text(91,187,'每一步，都向上。',8,BLUE)}
      <ellipse cx="119.5" cy="69" rx="53" ry="11" fill="#fdfdfc" stroke="#cbd3df" stroke-width="3"/>
      <ellipse cx="119.5" cy="68" rx="46" ry="6" fill="#e9edf3"/>
    </g>
    <g transform="translate(81 -6) rotate(8 161 145)">
      <path d="M105 65L122 224Q164 241 205 224L222 65Z" fill="{BLUE}" stroke="#2c5ed7"/>
      <path d="M207 77L193 227Q200 227 205 224L221 76Z" fill="#18294412"/>
      {mark(c,133,99,62,'#fff')}
      {text(141,181,'上行宝',15,'#fff',700)}
      {text(136,201,'每一步，都向上。',8,'#e3ebff')}
      <ellipse cx="163.5" cy="65" rx="59" ry="12" fill="#fff" stroke="#d8dfeb" stroke-width="3"/>
      <ellipse cx="163.5" cy="64" rx="51" ry="7" fill="#e9edf3"/>
    </g>'''

    shirt_path = 'M54 0L22 14L0 62L31 77L44 52V183Q98 192 152 183V52L165 77L196 62L174 14L142 0Q127 20 98 20Q69 20 54 0Z'
    shirt = f'''
    <g transform="translate(33 43) scale(.88)">
      <path d="{shirt_path}" fill="#fff" stroke="#d6dce6" stroke-width="1.5"/>
      <path d="M54 0Q65 37 98 37Q131 37 142 0M45 175Q98 183 152 175" fill="none" stroke="#e0e4eb" stroke-width="2"/>
      {brand(c,95,62,21)}
      <path d="M44 52L39 27M152 52L157 27" stroke="#e3e7ee"/>
    </g>
    <g transform="translate(188 58) scale(.88)">
      <path d="{shirt_path}" fill="{BLUE}" stroke="#2c5dd3" stroke-width="1.5"/>
      <path d="M54 0Q98 24 142 0M45 175Q98 183 152 175" fill="none" stroke="#ffffff40" stroke-width="2"/>
      {mark(c,67,40,62,'#fff')}
      {text(98,130,'每一步，都向上。',13,'#fff',700,extra='text-anchor="middle"')}
      {text(98,148,'SHANGXINGBAO',6,'#e3ebff',400,extra='text-anchor="middle" letter-spacing="1.5"')}
    </g>
    {text(114,247,'正面 · 胸前标识',10,'#606a77',extra='text-anchor="middle"')}
    {text(274,258,'背面 · 品牌口号',10,'#606a77',extra='text-anchor="middle"')}'''

    brochure = f'''
    <path d="M38 64L149 44L258 63L363 44V231L258 249L149 230L38 249Z" fill="#18294410"/>
    <path d="M33 58L145 38L145 224L33 244Z" fill="#fff" stroke="#e1e5eb"/>
    <path d="M145 38L255 58V244L145 224Z" fill="#eef2fb" stroke="#dde4f1"/>
    <path d="M255 58L360 38V224L255 244Z" fill="{BLUE}"/>
    <g transform="matrix(1 -.178 0 1 33 58)">
      {brand(c,10,13,22)}
      {text(15,61,'把知识学懂',13,INK,700)}
      {text(15,83,'把题目做会',13,INK,700)}
      {text(15,116,'知识理解',9,'#606a77')}
      {text(15,136,'练习巩固',9,'#606a77')}
      {text(15,156,'复习掌握',9,'#606a77')}
    </g>
    <g transform="matrix(1 .182 0 1 145 38)">
      {text(13,36,'清晰的学习路径',11,INK,700)}
      <path d="M20 60V141" stroke="#b9caef" stroke-width="2"/>
      <g fill="{BLUE}"><circle cx="20" cy="65" r="4"/><circle cx="20" cy="99" r="4"/><circle cx="20" cy="133" r="4"/></g>
      {text(32,69,'建立认知',10)}{text(32,103,'强化练习',10)}{text(32,137,'复习巩固',10)}
      {text(13,169,'一套路径，稳步向上。',8,'#606a77')}
    </g>
    <g transform="matrix(1 -.19 0 1 255 58)">
      {mark(c,25,16,56,'#fff')}
      {text(17,102,'每一步，',20,'#fff',700)}
      {text(17,130,'都向上。',20,'#fff',700)}
      {text(18,168,'上行宝 · 全链路备考',8,'#e3ebff')}
    </g>'''

    book = f'''
    <g transform="translate(54 40) rotate(-9 76 101)">
      <rect x="4" y="6" width="149" height="198" fill="#18294412"/>
      <path d="M0 0H149V193L142 200H0Z" fill="#fff" stroke="#cbd4e2"/>
      <path d="M0 191H149L142 200H0Z" fill="#e3e8f0"/>
      <rect width="149" height="58" fill="{BLUE}"/>
      {brand(c,13,14,27,'#fff','#fff')}
      {text(19,97,'错题复盘',22,INK,700)}
      {text(19,124,'学习笔记',15,BLUE,700)}
      {text(19,161,'理解 · 整理 · 再练习',9,'#606a77')}
      {text(19,181,'封面示意 / 非正式出版物',7,'#606a77')}
      <path d="M7 0V191" stroke="#18294412" stroke-width="2"/>
    </g>
    <g transform="translate(191 30) rotate(7 78 106)">
      <rect x="5" y="7" width="153" height="211" fill="#18294412"/>
      <path d="M0 0H153V204L147 213H0Z" fill="#fff" stroke="#cbd4e2"/>
      <path d="M0 202H153L147 213H0Z" fill="#e3e8f0"/>
      <rect width="153" height="203" fill="{BLUE}"/>
      <path d="M8 0V203" stroke="#ffffff25" stroke-width="2"/>
      {brand(c,16,15,25,'#fff','#fff')}
      {text(20,88,'备考知识',23,'#fff',700)}
      {text(20,118,'手册',23,'#fff',700)}
      {text(21,143,'把知识学懂，把题目做会。',8,'#e3ebff')}
      {mark(c,92,150,41,'#fff')}
      {text(21,187,'样书 / 内容待定',8,'#e3ebff')}
    </g>'''

    studies = [('business-card','名片','正反面',card),('paper-cup','一次性水杯','双色纸杯',cup),('t-shirt','T 恤衫','正反面',shirt),('brochure','宣传册','三折页',brochure),('book','书籍','封面与书脊',book)]
    result=[]
    for slug,label,detail,body in studies:
        svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" role="img" aria-labelledby="title desc" font-family="Noto Sans SC, Microsoft YaHei, sans-serif">
<title id="title">上行宝 · {c['name']} · {label}应用示意</title>
<desc id="desc">{detail}的矢量设计预览。文字为示意内容，非印刷生产文件。</desc>
<rect width="400" height="280" fill="#eef1f6"/>
{body}
</svg>'''
        result.append((slug,label,detail,svg))
    return result
