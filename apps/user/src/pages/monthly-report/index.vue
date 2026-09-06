<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import QRCode from 'qrcode'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import DebugMenu from '@/components/DebugMenu.vue'
import { backOrFallback } from '@/utils/navigation'
import { getMonthlyReport } from '@/utils/monthlyReports'

const reportId = ref('2026-07')
const saving = ref(false)
type ReportViewMode = 'long' | 'multi'
type ReportDevicePreset = 'responsive' | 'iphone14pro' | 'iphone15promax'
const viewMode = ref<ReportViewMode>((uni.getStorageSync('sxb-monthly-report-view') || 'long') as ReportViewMode)
const storedDevicePreset = uni.getStorageSync('sxb-monthly-report-device')
const devicePreset = ref<ReportDevicePreset>(
  ['iphone14pro', 'iphone15promax'].includes(storedDevicePreset) ? storedDevicePreset : 'responsive'
)
const currentSlide = ref(0)
const slideCount = 7
const slideQuotes = ['每一次学习，都在积累底气。', '每一次出现，都是学习习惯的证据。', '稳定，比偶尔的高峰更重要。', '看见薄弱处，进步才有方向。', '课程、笔记与错题，共同组成知识体系。', '复盘不是回头看，是为了走得更稳。', '新的一个月，继续向上。']
const reportQrCode = ref('')
const report = computed(() => getMonthlyReport(reportId.value) || getMonthlyReport('2026-07')!)
const publicReportUrl = computed(() => `https://www.shangxingbao.com/report/${report.value.id}`)
const maxDaily = computed(() => Math.max(...report.value.dailyQuestions, 1))
const maxSubject = computed(() => Math.max(...report.value.subjects.map(item => item.total), 1))
const calendarDays = computed(() => {
  const learnedDayMap: Record<string, number[]> = {
    '2026-05': [3, 5, 6, 9, 12, 13, 17, 20, 22],
    '2026-06': [1, 2, 5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 18, 19, 21, 23, 24],
    '2026-07': [1, 2, 4, 5, 6, 7, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26],
  }
  const learnedDays = new Set(learnedDayMap[report.value.id] || report.value.dailyQuestions.map((value, index) => value > 0 ? index + 1 : 0).filter(Boolean))
  const daysInMonth = new Date(report.value.year, report.value.month, 0).getDate()
  const mondayFirstOffset = (new Date(report.value.year, report.value.month - 1, 1).getDay() + 6) % 7
  return [
    ...Array.from({ length: mondayFirstOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, studied: learnedDays.has(index + 1) })),
  ]
})
const restDays = computed(() => new Date(report.value.year, report.value.month, 0).getDate() - report.value.metrics.studyDays)
const deviceStyle = computed(() => {
  const sizes: Record<Exclude<ReportDevicePreset, 'responsive'>, { width: number; height: number }> = {
    iphone14pro: { width: 393, height: 852 },
    iphone15promax: { width: 430, height: 932 },
  }
  if (devicePreset.value === 'responsive') return {}
  const size = sizes[devicePreset.value]
  const scale = size.width / 430
  return {
    '--report-width': `${size.width}px`,
    '--report-height': `${size.height}px`,
    '--report-card-height': `${Math.round(size.height * .5365)}px`,
    '--report-device-scale': `${scale}`,
    '--report-content-shift': `${30 * scale}px`,
    '--report-chapter-margin': `${15.72 * scale}px`,
    '--report-qr-margin': `${106.72 * scale}px`,
    '--report-nav-padding': `${34 * scale}px`,
    '--report-nav-button': `${45 * scale}px`,
    '--report-share-width': `${160.73 * scale}px`,
    '--report-share-gap': `${11 * scale}px`,
    '--report-share-offset': `${110 * scale}px`,
    '--report-summary-height': `${110 * scale}px`,
    '--report-summary-text': `${13.8 * scale}px`,
  }
})

onLoad((options) => {
  if (options?.id && getMonthlyReport(options.id)?.status === 'ready') reportId.value = options.id
})

watch(publicReportUrl, async (url) => {
  reportQrCode.value = await QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: '#182033', light: '#ffffff' } })
}, { immediate: true })

onShareAppMessage(() => ({
  title: `${report.value.year}年${report.value.month}月学习报告｜${report.value.headline}`,
  path: `/pages/monthly-report/index?id=${report.value.id}`,
}))

const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}小时${minutes % 60}分`
const back = () => backOrFallback('/pages/profile-center/index?mode=report')
const toast = (title: string) => uni.showToast({ title, icon: 'none' })
const setViewMode = (key: string) => {
  if (key === 'long' || key === 'multi') {
    viewMode.value = key
    currentSlide.value = 0
    uni.setStorageSync('sxb-monthly-report-view', key)
    return
  }
  if (key === 'responsive' || key === 'iphone14pro' || key === 'iphone15promax') {
    devicePreset.value = key
    uni.setStorageSync('sxb-monthly-report-device', key)
  }
}
const changeSlide = (next: number) => { currentSlide.value = Math.min(Math.max(next, 0), slideCount - 1) }
const onSlideChange = (event: { detail: { current: number } }) => { currentSlide.value = event.detail.current }

const drawPoster = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const scale = width / 1080
  const p = (value: number) => value * scale
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#273544')
  gradient.addColorStop(.58, '#151c31')
  gradient.addColorStop(1, '#24204d')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#d6b562'
  ctx.fillRect(p(70), p(78), p(90), p(8))
  ctx.fillStyle = '#f4f0e5'
  ctx.font = `bold ${p(48)}px sans-serif`
  ctx.fillText('上行宝 · 月度学习报告', p(70), p(155))
  ctx.fillStyle = '#d6b562'
  ctx.font = `bold ${p(86)}px sans-serif`
  ctx.fillText(`${report.value.year}年 ${report.value.month}月`, p(70), p(275))
  ctx.fillStyle = '#b7c0ce'
  ctx.font = `${p(31)}px sans-serif`
  const headline = report.value.headline
  ctx.fillText(headline.slice(0, 24), p(70), p(340))
  if (headline.length > 24) ctx.fillText(headline.slice(24), p(70), p(386))
  const stats = [
    ['学习天数', `${report.value.metrics.studyDays}天`],
    ['完成题目', `${report.value.metrics.questions}题`],
    ['学习时长', `${Math.floor(report.value.metrics.minutes / 60)}小时`],
    ['掌握提升', `+${report.value.metrics.masteryGain}%`],
  ]
  stats.forEach(([label, value], index) => {
    const x = p(70 + (index % 2) * 480)
    const y = p(470 + Math.floor(index / 2) * 190)
    ctx.fillStyle = 'rgba(255,255,255,.07)'
    ctx.fillRect(x, y, p(420), p(145))
    ctx.fillStyle = '#d6b562'
    ctx.font = `bold ${p(52)}px sans-serif`
    ctx.fillText(value, x + p(28), y + p(62))
    ctx.fillStyle = '#aeb8c7'
    ctx.font = `${p(28)}px sans-serif`
    ctx.fillText(label, x + p(28), y + p(111))
  })
  ctx.fillStyle = '#f4f0e5'
  ctx.font = `bold ${p(38)}px sans-serif`
  ctx.fillText('本月亮点', p(70), p(890))
  report.value.highlights.slice(0, 3).forEach((item, index) => {
    const y = p(960 + index * 100)
    ctx.fillStyle = '#d6b562'
    ctx.beginPath(); ctx.arc(p(84), y - p(10), p(8), 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#d7dee8'
    ctx.font = `${p(29)}px sans-serif`
    ctx.fillText(item.slice(0, 29), p(115), y)
  })
  ctx.fillStyle = 'rgba(214,181,98,.12)'
  ctx.fillRect(p(70), p(1285), p(940), p(165))
  ctx.fillStyle = '#d6b562'
  ctx.font = `bold ${p(34)}px sans-serif`
  ctx.fillText('下月第一目标', p(100), p(1350))
  ctx.fillStyle = '#e5e9ef'
  ctx.font = `${p(29)}px sans-serif`
  ctx.fillText(report.value.nextSteps[0].slice(0, 30), p(100), p(1405))
  ctx.fillStyle = '#8e99aa'
  ctx.font = `${p(25)}px sans-serif`
  ctx.fillText('持续学习，让每一次进步都有记录', p(70), p(1535))
  ctx.fillStyle = '#d6b562'
  ctx.font = `bold ${p(30)}px sans-serif`
  ctx.textAlign = 'right'
  ctx.fillText('上行宝', p(1010), p(1535))
  ctx.textAlign = 'left'
}

const createPosterBlob = async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1600
  const ctx = canvas.getContext('2d')!
  drawPoster(ctx, canvas.width, canvas.height)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('poster')), 'image/png'))
}

const wrapCanvasText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 3) => {
  let line = ''
  let lines = 0
  for (const char of text) {
    if (ctx.measureText(line + char).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight)
      line = char
      lines += 1
      if (lines >= maxLines) return
    } else line += char
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight)
}

const loadCanvasImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = src
})

const drawMultiPoster = async (ctx: CanvasRenderingContext2D, width: number, height: number, index: number) => {
  const scale = width / 1080
  const p = (value: number) => value * scale
  const titles = ['月度总览', '学习日历', '学习趋势与刷题', '章节与知识点', '课程与学习工具', '本月总结', '下月计划']
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#263544'); gradient.addColorStop(.56, '#151c31'); gradient.addColorStop(1, '#282052')
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#d6b562'; ctx.fillRect(p(68), p(68), p(92), p(7))
  ctx.fillStyle = '#8f9aaa'; ctx.font = `${p(25)}px sans-serif`; ctx.fillText(`上行宝 · ${report.value.year}年${report.value.month}月学习报告`, p(68), p(130))
  ctx.fillStyle = '#f4f0e5'; ctx.font = `bold ${p(57)}px sans-serif`; ctx.fillText(titles[index], p(68), p(225))
  ctx.fillStyle = '#d6b562'; ctx.font = `bold ${p(26)}px sans-serif`; ctx.textAlign = 'right'; ctx.fillText(`${index + 1} / ${slideCount}`, p(1010), p(130)); ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(p(68), p(285), p(944), p(1120))
  if (index === 0) {
    ctx.fillStyle = '#e2c476'; ctx.font = `bold ${p(74)}px sans-serif`; ctx.fillText(`${report.value.year}年 ${report.value.month}月`, p(115), p(405))
    const values = [[report.value.metrics.studyDays,'学习天数'],[report.value.metrics.questions,'完成题目'],[Math.floor(report.value.metrics.minutes/60),'学习小时'],[`+${report.value.metrics.masteryGain}%`,'掌握提升']]
    values.forEach(([value,label], i) => { const x=p(115+(i%2)*445),y=p(540+Math.floor(i/2)*235);ctx.fillStyle='rgba(255,255,255,.07)';ctx.fillRect(x,y,p(395),p(185));ctx.fillStyle='#d6b562';ctx.font=`bold ${p(58)}px sans-serif`;ctx.fillText(String(value),x+p(25),y+p(77));ctx.fillStyle='#aeb8c7';ctx.font=`${p(29)}px sans-serif`;ctx.fillText(String(label),x+p(25),y+p(133)) })
    ctx.fillStyle='#cbd3df';ctx.font=`${p(31)}px sans-serif`;wrapCanvasText(ctx,report.value.headline,p(115),p(1080),p(820),p(48),3)
  } else if (index === 1) {
    ctx.fillStyle='#aeb8c7';ctx.font=`${p(28)}px sans-serif`;ctx.fillText(`${report.value.year}年${report.value.month}月 · 记录是否学习`,p(115),p(405))
    const weekdays=['一','二','三','四','五','六','日'];weekdays.forEach((day,i)=>{ctx.fillStyle='#8f9aaa';ctx.font=`bold ${p(26)}px sans-serif`;ctx.textAlign='center';ctx.fillText(day,p(170+i*120),p(500))})
    calendarDays.value.forEach((item,i)=>{if(!item)return;const col=i%7,row=Math.floor(i/7),x=p(170+col*120),y=p(600+row*135);ctx.beginPath();ctx.arc(x,y,p(43),0,Math.PI*2);ctx.fillStyle=item.studied?'#d6b562':'#313b4e';ctx.fill();ctx.fillStyle=item.studied?'#172033':'#8c98a9';ctx.font=`bold ${p(27)}px sans-serif`;ctx.textAlign='center';ctx.fillText(String(item.day),x,y+p(9))});ctx.textAlign='left'
    ctx.fillStyle='#d6b562';ctx.font=`bold ${p(45)}px sans-serif`;ctx.fillText(`${report.value.metrics.studyDays} 天学习`,p(115),p(1280));ctx.fillStyle='#8793a5';ctx.font=`${p(28)}px sans-serif`;ctx.fillText(`${restDays.value} 天未学习 · 最长连续 ${report.value.metrics.longestStreak} 天`,p(410),p(1280))
  } else if (index === 2) {
    ctx.fillStyle='#d6b562';ctx.font=`bold ${p(50)}px sans-serif`;ctx.fillText(`${report.value.metrics.questions} 道`,p(115),p(405));ctx.fillStyle='#aeb8c7';ctx.font=`${p(28)}px sans-serif`;ctx.fillText(`本月正确率 ${report.value.metrics.accuracy}% · 最长连续学习 ${report.value.metrics.longestStreak} 天`,p(115),p(460))
    const max=Math.max(...report.value.dailyQuestions,1);report.value.dailyQuestions.forEach((v,i)=>{const x=p(115+i*26),h=p(v/max*330);ctx.fillStyle=v===max?'#d6b562':'#667390';ctx.fillRect(x,p(900)-h,p(14),h)})
    report.value.subjects.forEach((item,i)=>{const y=p(1040+i*90);ctx.fillStyle='#c9d1dd';ctx.font=`${p(27)}px sans-serif`;ctx.fillText(item.name,p(115),y);ctx.fillStyle='#d6b562';ctx.textAlign='right';ctx.fillText(`${item.correct}/${item.total}`,p(920),y);ctx.textAlign='left'})
  } else if (index === 3) {
    ctx.fillStyle='#aeb8c7';ctx.font=`${p(29)}px sans-serif`;ctx.fillText(`本月学习 ${report.value.metrics.knowledge} 个知识点`,p(115),p(400))
    report.value.chapters.forEach((item,i)=>{const y=p(510+i*155);ctx.fillStyle='#d5dbe5';ctx.font=`bold ${p(29)}px sans-serif`;ctx.fillText(item.name,p(115),y);ctx.fillStyle=item.weak?'#cf7c7f':'#d6b562';ctx.textAlign='right';ctx.fillText(`${item.mastery}%  +${item.change}%`,p(930),y);ctx.textAlign='left';ctx.fillStyle='#343e51';ctx.fillRect(p(115),y+p(35),p(815),p(15));ctx.fillStyle=item.weak?'#b75e62':'#d6b562';ctx.fillRect(p(115),y+p(35),p(815*item.mastery/100),p(15))})
  } else if (index === 4) {
    report.value.tools.forEach((item,i)=>{const x=p(115+(i%2)*445),y=p(390+Math.floor(i/2)*285);ctx.fillStyle='rgba(255,255,255,.07)';ctx.fillRect(x,y,p(395),p(225));ctx.fillStyle='#d6b562';ctx.font=`bold ${p(56)}px sans-serif`;ctx.fillText(`${item.value}${item.unit}`,x+p(24),y+p(72));ctx.fillStyle='#e0e5ed';ctx.font=`bold ${p(29)}px sans-serif`;ctx.fillText(item.label,x+p(24),y+p(130));ctx.fillStyle='#8793a5';ctx.font=`${p(24)}px sans-serif`;ctx.fillText(item.note,x+p(24),y+p(178))})
  } else if (index === 5) {
    ctx.fillStyle='#d6b562';ctx.font=`bold ${p(31)}px sans-serif`;ctx.fillText('本月亮点',p(115),p(405));report.value.highlights.forEach((item,i)=>{ctx.fillStyle='#d7dee8';ctx.font=`${p(28)}px sans-serif`;wrapCanvasText(ctx,`· ${item}`,p(115),p(490+i*125),p(800),p(40),2)})
    ctx.fillStyle='#cf7c7f';ctx.font=`bold ${p(31)}px sans-serif`;ctx.fillText('需要关注',p(115),p(930));report.value.concerns.forEach((item,i)=>{ctx.fillStyle='#d7dee8';ctx.font=`${p(28)}px sans-serif`;wrapCanvasText(ctx,`· ${item}`,p(115),p(1015+i*125),p(800),p(40),2)})
  } else {
    report.value.nextSteps.forEach((item,i)=>{const y=p(405+i*270);ctx.fillStyle='#d6b562';ctx.beginPath();ctx.arc(p(155),y,p(43),0,Math.PI*2);ctx.fill();ctx.fillStyle='#192033';ctx.font=`bold ${p(32)}px sans-serif`;ctx.textAlign='center';ctx.fillText(String(i+1),p(155),y+p(11));ctx.textAlign='left';ctx.fillStyle='#e0e5ed';ctx.font=`bold ${p(31)}px sans-serif`;wrapCanvasText(ctx,item,p(235),y-p(20),p(690),p(47),3)})
    if (reportQrCode.value) {
      const qrImage = await loadCanvasImage(reportQrCode.value)
      ctx.fillStyle='#d6b562';ctx.fillRect(p(422),p(1055),p(236),p(236));ctx.fillStyle='#fff';ctx.fillRect(p(432),p(1065),p(216),p(216));ctx.drawImage(qrImage,p(442),p(1075),p(196),p(196))
    }
  }
  const brandGradient=ctx.createLinearGradient(p(68),0,p(1012),0);brandGradient.addColorStop(0,'#27364d');brandGradient.addColorStop(.5,'#465a78');brandGradient.addColorStop(1,'#2b3850');ctx.fillStyle=brandGradient;ctx.fillRect(p(68),p(1335),p(944),p(70));ctx.save();ctx.translate(p(540),p(1379));ctx.transform(1,0,-.24,1,0,0);ctx.fillStyle='#f4f6fa';ctx.font=`bold ${p(27)}px sans-serif`;ctx.textAlign='center';ctx.fillText('SXB   SXB   SXB   SXB   SXB',0,0);ctx.restore();ctx.fillStyle='#778497';ctx.font=`${p(25)}px sans-serif`;ctx.textAlign='center';ctx.fillText('持续学习，让每一次进步都有记录',p(540),p(1505));ctx.textAlign='left'
}

const createMultiPosterBlob = async (index: number) => {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1600
  const ctx = canvas.getContext('2d')!; await drawMultiPoster(ctx, canvas.width, canvas.height, index)
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('poster')),'image/png'))
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;link.style.display='none';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)
}

// #ifdef H5
const captureReportSlideBlob = async (index: number) => {
  const source = document.querySelectorAll<HTMLElement>('.report-swiper .report-slide')[index]
  const page = document.querySelector<HTMLElement>('.report-page.multi-page')
  if (!source || !page) throw new Error('report slide not found')

  const rect = source.getBoundingClientRect()
  const stage = document.createElement('div')
  stage.className = page.className
  stage.style.cssText = `position:fixed;left:0;top:0;z-index:-10000;width:${rect.width}px;height:${rect.height}px;min-height:0;padding:0;overflow:visible;pointer-events:none;background:transparent;`
  const context = document.createElement('div')
  context.className = 'multi-report'
  context.style.cssText = `width:${rect.width}px;height:${rect.height}px;`
  const clone = source.cloneNode(true) as HTMLElement
  clone.style.cssText += `width:${rect.width}px;height:${rect.height}px;transform:none;`
  context.appendChild(clone)
  stage.appendChild(context)
  document.body.appendChild(stage)

  try {
    await document.fonts?.ready
    const images = Array.from(clone.querySelectorAll('img'))
    await Promise.all(images.map(image => image.complete
      ? Promise.resolve()
      : new Promise<void>(resolve => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      })))
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(clone, {
      backgroundColor: null,
      logging: false,
      scale: Math.max(2, window.devicePixelRatio || 1),
      useCORS: true,
      width: rect.width,
      height: rect.height,
    })
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('capture')), 'image/png'))
  } finally {
    stage.remove()
  }
}
// #endif

const saveMiniPosterPage = (index: number, multi: boolean) => new Promise<void>((resolve, reject) => {
  const context = uni.createCanvasContext('reportPoster')
  const width = 540
  const height = 800
  const titles = ['月度总览', '学习日历', '学习趋势与刷题', '章节与知识点', '课程与学习工具', '本月总结', '下月计划']
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#273544'); gradient.addColorStop(1, '#24204d')
  context.setFillStyle(gradient); context.fillRect(0, 0, width, height)
  context.setFillStyle('#d6b562'); context.fillRect(35, 38, 45, 4)
  context.setFillStyle('#9aa5b5'); context.setFontSize(14); context.fillText(`上行宝 · ${report.value.year}年${report.value.month}月学习报告`, 35, 70)
  context.setFillStyle('#d6b562'); context.setFontSize(14); context.fillText(`${index + 1} / ${multi ? slideCount : 1}`, 465, 70)
  context.setFillStyle('#f4f0e5'); context.setFontSize(29); context.fillText(multi ? titles[index] : `${report.value.year}年${report.value.month}月`, 35, 125)
  context.setFillStyle('rgba(255,255,255,.06)'); context.fillRect(35, 150, 470, 555)
  if (!multi || index === 0) {
    context.setFillStyle('#d6b562'); context.setFontSize(36); context.fillText(`${report.value.metrics.studyDays} 天`, 60, 245); context.fillText(`${report.value.metrics.questions} 题`, 290, 245)
    context.fillText(`${Math.floor(report.value.metrics.minutes / 60)} 小时`, 60, 385); context.fillText(`+${report.value.metrics.masteryGain}%`, 290, 385)
    context.setFillStyle('#aeb8c7'); context.setFontSize(16); context.fillText('学习天数', 60, 280); context.fillText('完成题目', 290, 280); context.fillText('学习时长', 60, 420); context.fillText('掌握提升', 290, 420)
    context.setFillStyle('#d7dee8'); context.setFontSize(17); context.fillText(report.value.headline.slice(0, 25), 60, 545); if (report.value.headline.length > 25) context.fillText(report.value.headline.slice(25, 50), 60, 580)
  } else if (index === 1) {
    context.setFillStyle('#9aa5b5');context.setFontSize(15);context.fillText(`${report.value.year}年${report.value.month}月 · 记录是否学习`,60,210)
    const weekdays=['一','二','三','四','五','六','日'];weekdays.forEach((day,i)=>{context.setFillStyle('#8995a6');context.setFontSize(14);context.fillText(day,78+i*62,260)})
    calendarDays.value.forEach((item,i)=>{if(!item)return;const col=i%7,row=Math.floor(i/7),x=82+col*62,y=310+row*66;context.setFillStyle(item.studied?'#d6b562':'#313b4e');context.beginPath();context.arc(x,y,21,0,Math.PI*2);context.fill();context.setFillStyle(item.studied?'#172033':'#8c98a9');context.setFontSize(13);context.fillText(String(item.day),x-(item.day>9?7:4),y+5)})
    context.setFillStyle('#d6b562');context.setFontSize(22);context.fillText(`${report.value.metrics.studyDays}天学习`,60,665);context.setFillStyle('#8995a6');context.setFontSize(14);context.fillText(`${restDays.value}天未学习 · 最长连续${report.value.metrics.longestStreak}天`,265,665)
  } else if (index === 2) {
    context.setFillStyle('#d6b562'); context.setFontSize(27); context.fillText(`${report.value.metrics.questions}题 · 正确率${report.value.metrics.accuracy}%`, 60, 230)
    report.value.subjects.forEach((item, i) => { context.setFillStyle('#d7dee8'); context.setFontSize(18); context.fillText(item.name, 60, 340 + i * 90); context.setFillStyle('#d6b562'); context.fillText(`${item.correct}/${item.total}`, 390, 340 + i * 90) })
  } else if (index === 3) {
    report.value.chapters.forEach((item, i) => { const y=220+i*88; context.setFillStyle('#d7dee8');context.setFontSize(17);context.fillText(item.name,60,y);context.setFillStyle(item.weak?'#cf7c7f':'#d6b562');context.fillText(`${item.mastery}%  +${item.change}%`,370,y);context.setFillStyle('#354052');context.fillRect(60,y+18,410,8);context.setFillStyle(item.weak?'#b75e62':'#d6b562');context.fillRect(60,y+18,410*item.mastery/100,8) })
  } else if (index === 4) {
    report.value.tools.forEach((item,i)=>{const x=60+(i%2)*220,y=220+Math.floor(i/2)*150;context.setFillStyle('#d6b562');context.setFontSize(28);context.fillText(`${item.value}${item.unit}`,x,y);context.setFillStyle('#e0e5ed');context.setFontSize(17);context.fillText(item.label,x,y+35);context.setFillStyle('#8995a6');context.setFontSize(13);context.fillText(item.note,x,y+63)})
  } else if (index === 5) {
    context.setFillStyle('#d6b562');context.setFontSize(20);context.fillText('本月亮点',60,215);report.value.highlights.forEach((item,i)=>{context.setFillStyle('#d7dee8');context.setFontSize(15);context.fillText(`· ${item.slice(0,27)}`,60,260+i*55)});context.setFillStyle('#cf7c7f');context.setFontSize(20);context.fillText('需要关注',60,480);report.value.concerns.forEach((item,i)=>{context.setFillStyle('#d7dee8');context.setFontSize(15);context.fillText(`· ${item.slice(0,27)}`,60,525+i*55)})
  } else {
    report.value.nextSteps.forEach((item,i)=>{const y=240+i*145;context.setFillStyle('#d6b562');context.beginPath();context.arc(78,y-6,20,0,Math.PI*2);context.fill();context.setFillStyle('#192033');context.setFontSize(16);context.fillText(String(i+1),73,y);context.setFillStyle('#e0e5ed');context.setFontSize(17);context.fillText(item.slice(0,25),115,y);if(item.length>25)context.fillText(item.slice(25,48),115,y+30)})
  }
  const brandGradient=context.createLinearGradient(35,0,505,0);brandGradient.addColorStop(0,'#27364d');brandGradient.addColorStop(.5,'#465a78');brandGradient.addColorStop(1,'#2b3850');context.setFillStyle(brandGradient);context.fillRect(35,665,470,40);context.save();context.setTransform(1,0,-.24,1,270,690);context.setFillStyle('#f4f6fa');context.setFontSize(14);context.fillText('SXB   SXB   SXB   SXB   SXB',-115,0);context.restore();context.setFillStyle('#8995a6');context.setFontSize(14);context.fillText('持续学习，让每一次进步都有记录',145,755)
  context.draw(false, () => uni.canvasToTempFilePath({ canvasId:'reportPoster',width,height,destWidth:1080,destHeight:1600,success:({tempFilePath})=>uni.saveImageToPhotosAlbum({filePath:tempFilePath,success:()=>resolve(),fail:reject}),fail:reject }))
})

const savePoster = async () => {
  if (saving.value) return
  saving.value = true
  // #ifdef H5
  try {
    if (viewMode.value === 'multi') {
      for (let index=0; index<slideCount; index+=1) downloadBlob(await captureReportSlideBlob(index), `上行宝-${report.value.year}年${report.value.month}月学习报告-${index+1}.png`)
      toast(`已生成${slideCount}张报告图片`)
    } else {
      downloadBlob(await createPosterBlob(), `上行宝-${report.value.year}年${report.value.month}月学习报告.png`)
      toast('报告图片已生成')
    }
  } catch { toast('图片生成失败，请稍后重试') }
  saving.value = false
  // #endif
  // #ifdef MP-WEIXIN
  try {
    const total = viewMode.value === 'multi' ? slideCount : 1
    for (let index=0; index<total; index+=1) await saveMiniPosterPage(index, viewMode.value === 'multi')
    toast(viewMode.value === 'multi' ? `已保存${slideCount}张图片` : '已保存到相册')
  } catch { toast('保存失败，请检查相册权限') }
  saving.value = false
  // #endif
}

const shareReport = async () => {
  // #ifdef H5
  const shareData = { title: `${report.value.year}年${report.value.month}月学习报告`, text: report.value.headline, url: window.location.href }
  if (navigator.share) {
    try { await navigator.share(shareData); return } catch { return }
  }
  await navigator.clipboard?.writeText(window.location.href)
  toast('报告链接已复制')
  // #endif
  // #ifdef MP-WEIXIN
  uni.showShareMenu({ withShareTicket: true })
  toast('请点击右上角分享')
  // #endif
}
</script>

<template>
  <view class="report-page safe-top" :class="[{ 'multi-page': viewMode === 'multi' }, `device-${devicePreset}`]" :style="deviceStyle">
    <view class="report-top"><button @tap="back"><uni-icons type="back" size="21" color="#dbe1eb" /></button><text>{{ report.month }}月学习报告</text><view v-if="viewMode === 'multi'" class="top-report-actions"><button :disabled="saving" @tap="savePoster"><uni-icons type="download" size="22" color="#e7ebf1" /></button><button @tap="shareReport"><uni-icons type="redo" size="22" color="#e7ebf1" /></button></view><view v-else></view></view>
    <view v-if="viewMode === 'long'" class="long-report">
    <view class="report-hero"><view class="hero-label"><text>MONTHLY REPORT</text><text>{{ report.generatedAt }} 生成</text></view><text class="hero-month">{{ report.year }}年 {{ report.month }}月</text><text class="hero-headline">{{ report.headline }}</text><view class="hero-metrics"><view><text>{{ report.metrics.studyDays }}</text><text>学习天数</text></view><view><text>{{ report.metrics.questions }}</text><text>完成题目</text></view><view><text>{{ formatMinutes(report.metrics.minutes) }}</text><text>学习时长</text></view><view><text>+{{ report.metrics.masteryGain }}%</text><text>掌握提升</text></view></view></view>

    <view class="report-section"><view class="section-heading"><view><text>学习趋势</text><text>每日完成题量</text></view><text>最长连续 {{ report.metrics.longestStreak }} 天</text></view><view class="daily-chart"><view v-for="(value,index) in report.dailyQuestions" :key="index" class="day-bar"><view :class="{ peak:value === maxDaily }" :style="{ height: `${Math.max(value / maxDaily * 100, value ? 8 : 2)}%` }"></view><text v-if="[0,5,10,15,20,25,30].includes(index)">{{ index + 1 }}</text></view></view><view class="chart-legend"><text>日期</text><text>最高单日 {{ maxDaily }} 题</text></view></view>

    <view class="report-section"><view class="section-heading"><view><text>刷题与错题</text><text>按科目统计完成与正确题量</text></view><text>正确率 {{ report.metrics.accuracy }}%</text></view><view class="subject-chart"><view v-for="item in report.subjects" :key="item.name" class="subject-row"><text>{{ item.name }}</text><view><view class="total-bar" :style="{ width:`${item.total/maxSubject*100}%` }"><view :style="{ width:`${item.correct/item.total*100}%` }"></view></view></view><text>{{ item.correct }}/{{ item.total }}</text></view></view><view class="subject-legend"><text><i class="correct"></i>正确</text><text><i></i>错误</text></view></view>

    <view class="report-section"><view class="section-heading"><view><text>章节与知识点</text><text>月末章节平均掌握度</text></view><text>{{ report.metrics.knowledge }} 个知识点</text></view><view class="chapter-list"><view v-for="item in report.chapters" :key="item.name"><view><text>{{ item.name }}</text><text :class="{ weak:item.weak }">{{ item.mastery }}% · +{{ item.change }}%</text></view><view><view :class="{ weak:item.weak }" :style="{ width:`${item.mastery}%` }"></view></view></view></view></view>

    <view class="report-section"><view class="section-heading"><view><text>课程与学习工具</text><text>精讲课、讲义及工具使用统计</text></view></view><view class="tool-stats"><view v-for="item in report.tools" :key="item.label"><text>{{ item.value }}<small>{{ item.unit }}</small></text><text>{{ item.label }}</text><text>{{ item.note }}</text></view></view></view>

    <view class="report-section summary-section"><view class="section-heading"><view><text>月度总结</text><text>根据本月学习结果生成</text></view></view><view class="summary-group good"><text>本月亮点</text><view v-for="item in report.highlights" :key="item"><i></i><text>{{ item }}</text></view></view><view class="summary-group concern"><text>需要关注</text><view v-for="item in report.concerns" :key="item"><i></i><text>{{ item }}</text></view></view><view class="summary-group next"><text>下月计划</text><view v-for="(item,index) in report.nextSteps" :key="item"><i>{{ index + 1 }}</i><text>{{ item }}</text></view></view></view>

    <view class="report-actions"><button @tap="savePoster"><uni-icons type="download" size="19" color="#d6b562" />{{ saving ? '正在生成' : '保存图片' }}</button><button @tap="shareReport"><uni-icons type="redo" size="19" color="#1c2437" />分享报告</button></view>
    <text class="privacy-tip">分享图片仅包含学习数据，不包含手机号、订单等隐私信息</text>
    </view>
    <view v-else class="multi-report">
      <view class="slide-progress"><view v-for="index in slideCount" :key="index" :class="{ active: index - 1 === currentSlide, passed: index - 1 < currentSlide }"></view></view>
      <swiper class="report-swiper" :current="currentSlide" :duration="260" @change="onSlideChange">
        <swiper-item><view class="report-slide slide-cover"><view class="slide-kicker">MONTHLY REPORT · 01</view><view class="slide-fill"><text class="slide-title">{{ report.month }}月学习报告</text><text class="slide-subtitle">{{ report.headline }}</text><view class="cover-metrics"><view><text>{{ report.metrics.studyDays }}</text><text>学习天数</text></view><view><text>{{ report.metrics.questions }}</text><text>完成题目</text></view><view><text>{{ Math.floor(report.metrics.minutes/60) }}h</text><text>学习时长</text></view><view><text>+{{ report.metrics.masteryGain }}%</text><text>掌握提升</text></view></view></view></view></swiper-item>
        <swiper-item><view class="report-slide slide-calendar"><view class="slide-kicker">STUDY CALENDAR · 02</view><view class="slide-fill"><text class="slide-title">{{ report.month }}月学习日历</text><view class="calendar-week"><text v-for="day in ['一','二','三','四','五','六','日']" :key="day">{{ day }}</text></view><view class="calendar-grid"><view v-for="(item,index) in calendarDays" :key="index" :class="{ empty:!item, studied:item?.studied }"><text v-if="item">{{ item.day }}</text></view></view><view class="calendar-stats"><view><text>{{ report.metrics.studyDays }}</text><text>学习天数</text></view><view><text>{{ restDays }}</text><text>未学习天数</text></view><view><text>{{ report.metrics.longestStreak }}</text><text>最长连续</text></view></view></view></view></swiper-item>
        <swiper-item><view class="report-slide"><view class="slide-kicker">LEARNING TREND · 03</view><view class="slide-fill"><text class="slide-title">学习趋势与刷题</text><view class="slide-daily-chart"><view v-for="(value,index) in report.dailyQuestions" :key="index"><view :class="{ peak:value===maxDaily }" :style="{ height:`${Math.max(value/maxDaily*100,value?8:2)}%` }"></view></view></view><view class="slide-fact-row"><view><text>{{ report.metrics.questions }}</text><text>本月题量</text></view><view><text>{{ report.metrics.accuracy }}%</text><text>正确率</text></view><view><text>{{ maxDaily }}</text><text>单日最高</text></view></view><view class="slide-subjects"><view v-for="item in report.subjects" :key="item.name"><text>{{ item.name }}</text><view><view :style="{ width:`${item.correct/item.total*100}%` }"></view></view><text>{{ item.correct }}/{{ item.total }}</text></view></view></view></view></swiper-item>
        <swiper-item><view class="report-slide"><view class="slide-kicker">MASTERY · 04</view><view class="slide-fill"><text class="slide-title">章节与知识点</text><text class="slide-subtitle">本月学习 {{ report.metrics.knowledge }} 个知识点</text><view class="slide-chapters"><view v-for="item in report.chapters" :key="item.name"><view><text>{{ item.name }}</text><text :class="{ weak:item.weak }">{{ item.mastery }}% · +{{ item.change }}%</text></view><view><view :class="{ weak:item.weak }" :style="{ width:`${item.mastery}%` }"></view></view></view></view></view></view></swiper-item>
        <swiper-item><view class="report-slide"><view class="slide-kicker">LEARNING TOOLS · 05</view><view class="slide-fill"><text class="slide-title">课程与学习工具</text><view class="slide-tools"><view v-for="item in report.tools" :key="item.label"><text>{{ item.value }}<small>{{ item.unit }}</small></text><text>{{ item.label }}</text><text>{{ item.note }}</text></view></view></view></view></swiper-item>
        <swiper-item><view class="report-slide"><view class="slide-kicker">MONTHLY REVIEW · 06</view><view class="slide-fill"><text class="slide-title">本月总结</text><view class="slide-summary good"><text>本月亮点</text><view v-for="item in report.highlights" :key="item"><i></i><text>{{ item }}</text></view></view><view class="slide-summary concern"><text>需要关注</text><view v-for="item in report.concerns" :key="item"><i></i><text>{{ item }}</text></view></view></view></view></swiper-item>
        <swiper-item><view class="report-slide slide-plan"><view class="slide-kicker">NEXT MONTH · 07</view><view class="slide-fill"><text class="slide-title">下月学习计划</text><view class="plan-list"><view v-for="(item,index) in report.nextSteps" :key="item"><i>{{ index+1 }}</i><text>{{ item }}</text></view></view><view class="plan-target"><text>下月第一目标</text><text>{{ report.nextSteps[0] }}</text></view><view class="report-qr"><image v-if="reportQrCode" :src="reportQrCode" mode="aspectFit" /></view></view></view></swiper-item>
      </swiper>
      <text class="slide-quote">{{ slideQuotes[currentSlide] }}</text>
      <view class="slide-navigation" :class="{ final:currentSlide === slideCount - 1 }"><button :disabled="currentSlide === 0" @tap="changeSlide(currentSlide - 1)"><uni-icons type="back" size="36" color="currentColor" /></button><text>{{ currentSlide + 1 }} / {{ slideCount }}</text><button v-if="currentSlide < slideCount - 1" @tap="changeSlide(currentSlide + 1)"><uni-icons type="forward" size="36" color="currentColor" /></button><button v-else class="share-monthly" @tap="shareReport"><uni-icons type="redo" size="24" color="#1d2538" /><text>分享月报</text></button></view>
    </view>
    <canvas canvas-id="reportPoster" class="poster-canvas"></canvas>
    <DebugMenu page="月度学习报告" :options="[{ key:'long',label:'长图模式' },{ key:'multi',label:'多图模式' },{ key:'responsive',label:'跟随当前设备' },{ key:'iphone14pro',label:'iPhone 14 Pro（393 × 852）' },{ key:'iphone15promax',label:'iPhone 15 Pro Max（430 × 932）' }]" @select="setViewMode" />
  </view>
</template>

<style lang="scss" scoped>
.report-page{--report-device-scale:1;--report-content-shift:30px;--report-chapter-margin:15.72px;--report-qr-margin:106.72px;--report-nav-padding:34px;--report-nav-button:45px;--report-share-width:160.73px;--report-share-gap:11px;--report-share-offset:110px;--report-summary-height:110px;--report-summary-text:13.8px;width:var(--report-width,100%);max-width:430px;min-height:var(--report-height,100vh);margin:0 auto;box-sizing:border-box;padding:calc(env(safe-area-inset-top) + 18rpx) 20px 48rpx;background:#111827;color:#edf1f6}.report-page.device-iphone14pro,.report-page.device-iphone15promax{height:var(--report-height);overflow-y:auto}.report-top{height:58rpx;display:flex;align-items:center;justify-content:space-between}.report-top button{width:58rpx;height:58rpx;display:flex;align-items:center;justify-content:center;margin:0;padding:0;background:#202a3b;border-radius:14rpx}.report-top button::after{display:none}.report-top text{font-size:25rpx;font-weight:900}.report-top>view{width:58rpx}.report-hero{margin-top:19rpx;padding:22rpx;background:linear-gradient(125deg,#2b3948,#171d34 58%,#292052);border:1rpx solid #414a5b;border-radius:13rpx;box-shadow:0 16rpx 34rpx rgba(0,0,0,.25)}.hero-label{display:flex;justify-content:space-between;color:#d6b562;font-size:15rpx;font-weight:850}.hero-label text:last-child{color:#8995a7;font-weight:500}.hero-month{display:block;margin-top:19rpx;color:#e2c476;font-size:35rpx;font-weight:950}.hero-headline{display:block;margin-top:8rpx;color:#c9d0dc;font-size:19rpx;line-height:1.55}.hero-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:9rpx;margin-top:20rpx}.hero-metrics view{display:flex;flex-direction:column;gap:4rpx;padding:13rpx;background:rgba(255,255,255,.06);border:1rpx solid rgba(255,255,255,.08);border-radius:8rpx}.hero-metrics text:first-child{color:#e2c476;font-size:25rpx;font-weight:900}.hero-metrics text:last-child{color:#9da8b8;font-size:16rpx}.report-section{margin-top:14rpx;padding:18rpx;background:#1a2232;border:1rpx solid #303a4c;border-radius:11rpx}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10rpx}.section-heading>view{display:flex;flex-direction:column;gap:4rpx}.section-heading>view text:first-child{color:#edf0f5;font-size:23rpx;font-weight:900}.section-heading>view text:last-child{color:#7f8b9d;font-size:16rpx}.section-heading>text{color:#d6b562;font-size:16rpx;font-weight:800}.daily-chart{height:150rpx;display:flex;align-items:flex-end;gap:3rpx;margin-top:18rpx;border-bottom:1rpx solid #394354}.day-bar{height:100%;display:flex;align-items:center;justify-content:flex-end;flex:1;flex-direction:column}.day-bar>view{width:100%;min-height:2rpx;background:#53607a;border-radius:2rpx 2rpx 0 0}.day-bar>view.peak{background:#d6b562}.day-bar text{height:20rpx;margin-top:5rpx;color:#69768a;font-size:11rpx}.chart-legend{display:flex;justify-content:space-between;margin-top:7rpx;color:#768397;font-size:14rpx}.subject-chart{margin-top:17rpx}.subject-row{display:grid;grid-template-columns:74rpx 1fr 70rpx;align-items:center;gap:8rpx;margin-top:13rpx;color:#aeb8c7;font-size:16rpx}.subject-row>view{height:11rpx;background:#353f52;border-radius:10rpx}.total-bar{height:100%;background:#77525a;border-radius:10rpx}.total-bar>view{height:100%;background:#596b9e;border-radius:10rpx}.subject-row>text:last-child{text-align:right}.subject-legend{display:flex;justify-content:flex-end;gap:15rpx;margin-top:13rpx;color:#7f8b9d;font-size:14rpx}.subject-legend text{display:flex;align-items:center;gap:5rpx}.subject-legend i{width:9rpx;height:9rpx;background:#77525a;border-radius:2rpx}.subject-legend i.correct{background:#596b9e}.chapter-list{margin-top:15rpx}.chapter-list>view{margin-top:13rpx}.chapter-list>view>view:first-child{display:flex;justify-content:space-between;color:#b7c0ce;font-size:16rpx}.chapter-list>view>view:first-child text:last-child{color:#d6b562}.chapter-list .weak{color:#d47b78!important;background:#b75e62!important}.chapter-list>view>view:last-child{height:8rpx;margin-top:7rpx;background:#313b4d;border-radius:8rpx}.chapter-list>view>view:last-child>view{height:100%;background:linear-gradient(90deg,#53688d,#d6b562);border-radius:8rpx}.tool-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:9rpx;margin-top:16rpx}.tool-stats>view{display:flex;flex-direction:column;gap:4rpx;padding:13rpx;background:#202a3b;border-radius:8rpx}.tool-stats>view>text:first-child{color:#d6b562;font-size:25rpx;font-weight:900}.tool-stats small{margin-left:3rpx;font-size:14rpx}.tool-stats>view>text:nth-child(2){color:#c0c8d4;font-size:17rpx;font-weight:800}.tool-stats>view>text:last-child{color:#748196;font-size:14rpx}.summary-group{margin-top:17rpx;padding:14rpx;background:#202a3a;border-left:4rpx solid #d6b562;border-radius:6rpx}.summary-group>text{color:#d6b562;font-size:18rpx;font-weight:900}.summary-group>view{display:flex;align-items:flex-start;gap:8rpx;margin-top:10rpx;color:#b4becd;font-size:16rpx;line-height:1.55}.summary-group i{width:7rpx;height:7rpx;flex:none;margin-top:8rpx;background:#d6b562;border-radius:50%}.summary-group.concern{border-left-color:#b75e62}.summary-group.concern>text{color:#cf7c7f}.summary-group.concern i{background:#b75e62}.summary-group.next{border-left-color:#6679ad}.summary-group.next>text{color:#91a0cf}.summary-group.next i{width:23rpx;height:23rpx;display:flex;align-items:center;justify-content:center;margin-top:0;color:#cbd4ed;background:#4f608d;border-radius:50%;font-size:13rpx;font-style:normal}.report-actions{display:grid;grid-template-columns:1fr 1fr;gap:10rpx;margin-top:17rpx}.report-actions button{height:58rpx;display:flex;align-items:center;justify-content:center;gap:6rpx;margin:0;padding:0;color:#d6b562;background:#202a3b;border:1rpx solid #5d543d;border-radius:9rpx;font-size:19rpx;font-weight:850}.report-actions button:last-child{color:#1c2437;background:#d6b562;border-color:#d6b562}.report-actions button::after{display:none}.privacy-tip{display:block;margin-top:12rpx;color:#657286;font-size:14rpx;text-align:center}.poster-canvas{position:fixed;left:-10000px;width:540px;height:800px}
.multi-page{height:var(--report-height,100vh);min-height:0;overflow:hidden;padding-bottom:18rpx;background:linear-gradient(155deg,#111827,#201735)}.multi-page .report-top{position:relative}.multi-page .report-top>text{font-size:25rpx}.top-report-actions{width:auto!important;display:flex;gap:5rpx}.top-report-actions button{width:47rpx;height:47rpx;background:transparent;border-radius:50%}.top-report-actions button[disabled]{opacity:.5}.slide-progress{height:5rpx;display:grid;grid-template-columns:repeat(7,1fr);gap:5rpx;margin-top:13rpx}.slide-progress view{background:#3c3a45;border-radius:5rpx}.slide-progress view.active,.slide-progress view.passed{background:#d6b562}.report-swiper{height:calc(var(--report-height,100vh) - env(safe-area-inset-top) - 180rpx);margin-top:18rpx}.report-slide{position:relative;height:100%;box-sizing:border-box;overflow:hidden;padding:27rpx 25rpx;color:#eef1f5;background:linear-gradient(155deg,#293847 0%,#171d33 58%,#292052 100%);border:1rpx solid #414a5b;border-radius:15rpx;box-shadow:0 18rpx 39rpx rgba(0,0,0,.28)}.report-slide::before{position:absolute;top:12%;left:0;width:100%;content:'MONTHLY REPORT';color:rgba(255,255,255,.018);font-size:64rpx;font-weight:950;text-align:center}.report-slide::after{position:absolute;right:-80rpx;bottom:-100rpx;width:280rpx;height:280rpx;content:'';border:1rpx solid rgba(214,181,98,.1);border-radius:50%;box-shadow:0 0 0 45rpx rgba(214,181,98,.025),0 0 0 90rpx rgba(214,181,98,.018)}.slide-kicker{position:relative;z-index:1;color:#d6b562;font-size:15rpx;font-weight:850}.slide-fill{position:relative;z-index:1;height:calc(100% - 90rpx);display:flex;justify-content:center;flex-direction:column;padding-bottom:28rpx;box-sizing:border-box}.slide-title{display:block;color:#f2f0e9;font-size:34rpx;font-weight:950}.slide-subtitle{display:block;margin-top:13rpx;color:#aeb8c7;font-size:19rpx;line-height:1.55}.slide-quote{position:absolute;z-index:2;right:25rpx;bottom:25rpx;left:25rpx;color:#8e99aa;font-size:17rpx;text-align:center}.cover-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:15rpx;margin-top:55rpx}.cover-metrics view{display:flex;justify-content:center;flex-direction:column;gap:7rpx;min-height:112rpx;padding:20rpx;background:rgba(255,255,255,.065);border:1rpx solid rgba(214,181,98,.18);border-radius:9rpx}.cover-metrics text:first-child{color:#d6b562;font-size:40rpx;font-weight:950}.cover-metrics text:last-child{color:#aeb8c7;font-size:18rpx}.slide-cover .slide-title{font-size:43rpx}.calendar-week,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:10rpx}.calendar-week{margin-top:38rpx;color:#8f9aaa;font-size:17rpx;text-align:center}.calendar-grid{margin-top:16rpx}.calendar-grid>view{aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:#8d99aa;background:#30394b;border:1rpx solid #3b4659;border-radius:50%;font-size:17rpx;font-weight:850}.calendar-grid>view.empty{visibility:hidden}.calendar-grid>view.studied{color:#182033;background:#d6b562;border-color:#e0c67c;box-shadow:0 0 0 4rpx rgba(214,181,98,.08)}.calendar-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10rpx;margin-top:36rpx}.calendar-stats>view{display:flex;align-items:center;flex-direction:column;gap:5rpx;padding:15rpx 4rpx;background:rgba(255,255,255,.055);border:1rpx solid rgba(255,255,255,.07);border-radius:8rpx}.calendar-stats text:first-child{color:#d6b562;font-size:28rpx;font-weight:950}.calendar-stats text:last-child{color:#8e99aa;font-size:14rpx}.slide-daily-chart{height:230rpx;display:flex;align-items:flex-end;gap:3rpx;margin-top:40rpx;padding-bottom:4rpx;border-bottom:1rpx solid #445064}.slide-daily-chart>view{height:100%;display:flex;align-items:flex-end;flex:1}.slide-daily-chart>view>view{width:100%;min-height:2rpx;background:#667390;border-radius:2rpx 2rpx 0 0}.slide-daily-chart .peak{background:#d6b562}.slide-fact-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10rpx;margin-top:25rpx}.slide-fact-row>view{display:flex;align-items:center;flex-direction:column;gap:5rpx;padding:16rpx 4rpx;background:rgba(255,255,255,.055);border:1rpx solid rgba(255,255,255,.06);border-radius:7rpx}.slide-fact-row text:first-child{color:#d6b562;font-size:30rpx;font-weight:900}.slide-fact-row text:last-child{color:#8d99aa;font-size:15rpx}.slide-subjects{margin-top:30rpx}.slide-subjects>view{display:grid;grid-template-columns:75rpx 1fr 62rpx;align-items:center;gap:10rpx;margin-top:18rpx;color:#aeb8c7;font-size:16rpx}.slide-subjects>view>view{height:10rpx;background:#3a4456;border-radius:8rpx}.slide-subjects>view>view>view{height:100%;background:#d6b562;border-radius:8rpx}.slide-subjects>view>text:last-child{text-align:right}.slide-chapters{margin-top:20rpx;padding:4rpx 20rpx 25rpx;background:rgba(255,255,255,.035);border:1rpx solid rgba(255,255,255,.07);border-radius:10rpx}.slide-chapters>view{margin-top:30rpx}.slide-chapters>view>view:first-child{display:flex;justify-content:space-between;color:#c5cdd8;font-size:18rpx}.slide-chapters>view>view:first-child text:last-child{color:#d6b562}.slide-chapters>view>view:first-child .weak{color:#cf7c7f}.slide-chapters>view>view:last-child{height:11rpx;margin-top:11rpx;background:#374153;border-radius:9rpx}.slide-chapters>view>view:last-child>view{height:100%;background:linear-gradient(90deg,#61739c,#d6b562);border-radius:9rpx}.slide-chapters>view>view:last-child .weak{background:#b75e62}.slide-tools{display:grid;grid-template-columns:repeat(2,1fr);gap:14rpx;margin-top:30rpx}.slide-tools>view{display:flex;justify-content:center;flex-direction:column;gap:7rpx;min-height:120rpx;padding:20rpx;background:rgba(255,255,255,.06);border:1rpx solid rgba(214,181,98,.12);border-radius:8rpx}.slide-tools>view>text:first-child{color:#d6b562;font-size:35rpx;font-weight:950}.slide-tools small{margin-left:4rpx;font-size:16rpx}.slide-tools>view>text:nth-child(2){color:#dce1e8;font-size:19rpx;font-weight:850}.slide-tools>view>text:last-child{color:#8490a2;font-size:15rpx}.slide-summary{margin-top:25rpx;padding:22rpx;background:rgba(255,255,255,.055);border:1rpx solid rgba(255,255,255,.07);border-left:5rpx solid #d6b562;border-radius:7rpx}.slide-summary>text{color:#d6b562;font-size:21rpx;font-weight:900}.slide-summary>view{display:flex;align-items:flex-start;gap:10rpx;margin-top:17rpx;color:#c2cad6;font-size:18rpx;line-height:1.55}.slide-summary i{width:8rpx;height:8rpx;flex:none;margin-top:10rpx;background:#d6b562;border-radius:50%}.slide-summary.concern{border-left-color:#b75e62}.slide-summary.concern>text{color:#cf7c7f}.slide-summary.concern i{background:#b75e62}.plan-list{margin-top:20rpx}.plan-list>view{display:flex;align-items:center;gap:16rpx;margin-top:20rpx;min-height:76rpx;padding:20rpx;background:rgba(255,255,255,.055);border:1rpx solid rgba(255,255,255,.07);border-radius:8rpx}.plan-list i{width:36rpx;height:36rpx;display:flex;align-items:center;justify-content:center;flex:none;color:#192033;background:#d6b562;border-radius:50%;font-size:18rpx;font-style:normal;font-weight:900}.plan-list text{color:#d7dde6;font-size:18rpx;line-height:1.55}.plan-target{margin-top:26rpx;padding:22rpx;background:rgba(214,181,98,.1);border:1rpx solid rgba(214,181,98,.25);border-radius:8rpx}.plan-target text:first-child{display:block;color:#d6b562;font-size:18rpx;font-weight:900}.plan-target text:last-child{display:block;margin-top:9rpx;color:#e5e9ef;font-size:20rpx;line-height:1.5}.slide-navigation{display:flex;align-items:center;justify-content:space-between;margin-top:13rpx}.slide-navigation button{width:54rpx;height:54rpx;display:flex;align-items:center;justify-content:center;margin:0;padding:0;color:#1d2538;background:#d6b562;border-radius:50%}.slide-navigation button:first-child{color:#d6b562;background:#1e2738;border:1rpx solid #6a5d3d}.slide-navigation button[disabled]{color:#5f6877;background:#272e3b;border-color:#343d4d}.slide-navigation button::after{display:none}.slide-navigation>text{color:#9da8b7;font-size:17rpx;font-weight:850}.slide-navigation.final{display:grid;grid-template-columns:54rpx 1fr;gap:16rpx}.slide-navigation.final>text{display:none}.slide-navigation .share-monthly{width:100%;border-radius:30rpx;gap:8rpx;font-size:19rpx;font-weight:900}.slide-navigation .share-monthly text{color:#1d2538}

/* Multi-image reports share one fixed poster frame; only the content inside changes. */
.multi-page .report-top{margin-bottom:22rpx}.multi-page .slide-progress{margin-top:0}.multi-report{position:relative}.multi-report>.report-swiper,.multi-report>.slide-quote,.multi-report>.slide-navigation{transform:translateY(var(--report-content-shift))}.report-swiper{height:var(--report-card-height,56vh);margin-top:34rpx;overflow:visible}.report-slide{height:100%;overflow:hidden;padding:28rpx 27rpx 92rpx;border-radius:17rpx 17rpx 10rpx 10rpx}.report-slide::before{top:14%;font-size:68rpx}.report-slide::after{right:0;bottom:0;left:0;width:auto;height:70rpx;display:flex;align-items:center;justify-content:center;box-sizing:border-box;content:'SXB   SXB   SXB   SXB   SXB';color:#f4f6fa;background:linear-gradient(90deg,#27364d 0%,#465a78 50%,#2b3850 100%);border:0;border-radius:0 0 9rpx 9rpx;box-shadow:inset 0 1rpx 0 rgba(255,255,255,.15);font-size:19rpx;font-style:italic;font-weight:950;letter-spacing:3rpx;transform:none}.slide-fill{height:100%;justify-content:flex-start;padding:46rpx 0 0}.slide-kicker{position:absolute;top:26rpx;left:27rpx}.multi-report>.slide-quote{position:static;display:block;margin-top:48rpx;color:#8e99aa;font-size:18rpx;text-align:center}.slide-navigation{margin-top:34rpx}.slide-cover .slide-fill{padding-top:76rpx}.slide-cover .cover-metrics{margin-top:38rpx}.slide-calendar .slide-fill{padding-top:46rpx}.slide-calendar .calendar-week{margin-top:23rpx}.slide-calendar .calendar-grid{margin-top:11rpx}.slide-calendar .calendar-stats{margin-top:17rpx}.slide-daily-chart{height:140rpx;margin-top:18rpx}.slide-fact-row{margin-top:14rpx}.slide-subjects{margin-top:14rpx}.slide-subjects>view{margin-top:10rpx}.slide-chapters{margin-top:14rpx;padding-bottom:13rpx}.slide-chapters>view{margin-top:17rpx}.slide-tools{margin-top:16rpx;gap:8rpx}.slide-tools>view{min-height:67rpx;padding:10rpx 14rpx}.slide-tools>view>text:first-child{font-size:30rpx}.slide-tools>view>text:nth-child(2){font-size:17rpx}.slide-summary{margin-top:12rpx;padding:12rpx 15rpx}.slide-summary>view{margin-top:8rpx;font-size:15rpx}.plan-list{margin-top:8rpx}.plan-list>view{min-height:43rpx;margin-top:9rpx;padding:10rpx 14rpx}.plan-target{margin-top:12rpx;padding:12rpx 15rpx}
.multi-page .report-swiper{margin-top:50px}.multi-report>.slide-quote{margin-top:48rpx}.multi-page .slide-navigation{height:100px;margin-top:76rpx;padding:0 var(--report-nav-padding);box-sizing:border-box}.multi-page .slide-title{font-size:39rpx}.multi-page .slide-subtitle{font-size:22rpx}.multi-page .slide-kicker{font-size:17rpx}.multi-page .cover-metrics view{min-height:129rpx}.multi-page .cover-metrics text:first-child{font-size:46rpx}.multi-page .cover-metrics text:last-child{font-size:21rpx}.slide-cover .slide-title{font-size:49rpx}.slide-calendar .slide-fill{padding-top:30rpx}.slide-calendar .calendar-week{margin-top:22rpx}.slide-calendar .calendar-week,.slide-calendar .calendar-grid{gap:6rpx}.slide-calendar .calendar-stats{margin-top:28rpx}.slide-calendar .calendar-stats>view{padding:8rpx 4rpx}.slide-fact-row>view{min-height:74rpx}.slide-fact-row text:first-child{font-size:35rpx}.slide-fact-row text:last-child{font-size:18rpx}.slide-subjects{margin-top:18rpx}.slide-subjects>view{grid-template-columns:88rpx 1fr 68rpx;gap:12rpx;margin-top:13rpx;font-size:19rpx}.slide-subjects>view>view{height:15rpx}.slide-chapters{margin-top:var(--report-chapter-margin)}.slide-chapters>view{margin-top:18rpx}.slide-chapters>view>view:first-child{font-size:21rpx}.slide-chapters>view>view:last-child{height:13rpx;margin-top:13rpx}.slide-tools>view{min-height:77rpx}.slide-tools>view>text:first-child{font-size:35rpx}.slide-tools>view>text:nth-child(2){font-size:20rpx}.slide-tools>view>text:last-child{font-size:17rpx}.slide-summary{min-height:var(--report-summary-height);padding:15rpx 18rpx;box-sizing:border-box}.slide-summary>text{font-size:24rpx}.slide-summary>view{font-size:var(--report-summary-text)}.slide-navigation button{width:var(--report-nav-button);height:var(--report-nav-button);flex:none;color:#1d2538;background:#fff;border:1.5px solid #1d2538}.slide-navigation button:first-child{color:#fff;background:transparent;border:1.5px solid #fff}.slide-navigation button[disabled]{color:rgba(255,255,255,.38);background:transparent;border-color:rgba(255,255,255,.38)}.slide-navigation>text{font-size:26rpx;font-weight:600}.slide-navigation.final{display:flex;padding-right:var(--report-nav-padding);padding-left:var(--report-nav-padding)}.slide-navigation .share-monthly{width:var(--report-share-width);min-width:0;height:var(--report-nav-button);margin-left:var(--report-share-offset);gap:var(--report-share-gap);justify-self:auto;color:#1d2538;background:#fff;border:1.5px solid #1d2538;border-radius:30px}.report-qr{display:flex;align-items:center;justify-content:center;margin-top:var(--report-qr-margin)}.report-qr image{width:112rpx;height:112rpx;padding:7rpx;background:#fff;border:3px solid #d6b562;border-radius:7rpx;box-sizing:content-box}.device-iphone14pro .report-qr{margin-top:calc(var(--report-qr-margin) - 16px)}
</style>
