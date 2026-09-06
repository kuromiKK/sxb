export type OrderStatus = 'pending' | 'completed' | 'closed'
export type OrderBackendStatus = 'pending_payment' | 'paid' | 'closed' | 'refunding' | 'refunded'
export type PaymentMethod = 'wechat' | 'alipay'

export type RightsOrder = {
  no: string
  productName: string
  rightsName: string
  createdAt: number
  expiresAt?: number
  paidAt?: number
  amount: string
  status: OrderStatus
  backendStatus: OrderBackendStatus
  paymentMethod?: string
  lastPaymentMethod?: PaymentMethod
  lastPaymentAt?: number
  lastPaymentError?: string
  validity?: string
  closeReason?: string
}

const STORAGE_KEY = 'sxb-rights-orders'
export const PENDING_ORDER_DURATION = 30 * 60 * 1000

const seedOrders = (): RightsOrder[] => {
  const now = Date.now()
  return [
    {
      no: `SXB${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}0032`,
      productName: '上行宝旗舰版',
      rightsName: '旗舰版权益',
      createdAt: now - 5 * 60 * 1000,
      expiresAt: now + 25 * 60 * 1000,
      amount: '798.00',
      status: 'pending',
      backendStatus: 'pending_payment',
      validity: '支付成功后 12 个月',
    },
    {
      no: 'SXB202608110032',
      productName: '上行宝专业版',
      rightsName: '专业版权益',
      createdAt: new Date('2026-08-11T10:26:00+08:00').getTime(),
      paidAt: new Date('2026-08-11T10:28:00+08:00').getTime(),
      amount: '398.00',
      status: 'completed',
      backendStatus: 'paid',
      paymentMethod: '微信支付',
      validity: '2026-08-11 至 2027-08-10',
    },
    {
      no: 'SXB202608010018',
      productName: '12小时学习体验',
      rightsName: '1元试听权益',
      createdAt: new Date('2026-08-01T19:40:00+08:00').getTime(),
      amount: '1.00',
      status: 'closed',
      backendStatus: 'refunded',
      paymentMethod: '微信支付',
      validity: '12 小时',
      closeReason: '客服已完成退款，订单关闭',
    },
  ]
}

const saveOrders = (orders: RightsOrder[]) => {
  uni.setStorageSync(STORAGE_KEY, orders)
  uni.setStorageSync('sxb-pending-order', orders.some(item => item.status === 'pending'))
}

export const normalizeOrders = (orders: RightsOrder[], now = Date.now()) => {
  let changed = false
  const normalized = orders.map((item) => {
    if (item.status !== 'pending' || !item.expiresAt || item.expiresAt > now) return item
    changed = true
    return { ...item, status: 'closed' as const, backendStatus: 'closed' as const, closeReason: '超过30分钟未支付，订单已自动关闭' }
  })
  if (changed) saveOrders(normalized)
  return normalized
}

export const loadOrders = () => {
  const stored = uni.getStorageSync(STORAGE_KEY)
  const source = Array.isArray(stored) && stored.length ? stored as RightsOrder[] : seedOrders()
  const orders = source.map(item => item.rightsName === '旗舰版权益' ? { ...item, amount: '798.00' } : item)
  if (!Array.isArray(stored) || !stored.length || orders.some((item, index) => item.amount !== source[index].amount)) saveOrders(orders)
  return normalizeOrders(orders)
}

export const persistOrders = (orders: RightsOrder[]) => saveOrders(orders)

export const sortOrders = (orders: RightsOrder[]) => {
  const priority: Record<OrderStatus, number> = { pending: 0, completed: 1, closed: 2 }
  return [...orders].sort((a, b) => priority[a.status] - priority[b.status] || b.createdAt - a.createdAt)
}

export const getActivePendingOrder = (orders: RightsOrder[], now = Date.now()) => normalizeOrders(orders, now).find(item => item.status === 'pending' && Boolean(item.expiresAt && item.expiresAt > now))

export const createRightsOrder = (productName = '上行宝旗舰版', rightsName = '旗舰版权益', amount = '798.00'): RightsOrder => {
  const now = Date.now()
  return {
    no: `SXB${new Date(now).toISOString().replace(/\D/g, '').slice(0, 14)}${String(Math.floor(Math.random() * 90 + 10))}`,
    productName,
    rightsName,
    createdAt: now,
    expiresAt: now + PENDING_ORDER_DURATION,
    amount,
    status: 'pending',
    backendStatus: 'pending_payment',
    validity: '支付成功后 12 个月',
  }
}
