import { api, token } from '@/services/api'
export type OrderStatus = 'pending' | 'completed' | 'closed'
export type OrderBackendStatus = 'pending_payment' | 'paid' | 'closed' | 'refunding' | 'refunded'
export type PaymentMethod = 'wechat' | 'alipay'
export type RightsOrder = {
  no: string; productName: string; rightsName: string; createdAt: number; expiresAt?: number; paidAt?: number;
  amount: string; status: OrderStatus; backendStatus: OrderBackendStatus; paymentMethod?: string;
  lastPaymentMethod?: PaymentMethod; lastPaymentAt?: number; lastPaymentError?: string; validity?: string; closeReason?: string
}
const STORAGE_KEY = 'sxb-rights-orders'
export const PENDING_ORDER_DURATION = 30 * 60 * 1000
export const persistOrders = (orders: RightsOrder[]) => uni.setStorageSync(STORAGE_KEY, orders)
export const loadOrders = (): RightsOrder[] => token() ? uni.getStorageSync(STORAGE_KEY) || [] : []
export async function refreshOrders() {
  if (!token()) return []
  const rows = await api<any[]>('/orders')
  const names: Record<string, string> = { vip: 'VIP', svip: 'SVIP', upgrade: 'VIP 升 SVIP', trial: 'VIP 24小时体验' }
  const orders: RightsOrder[] = rows.map(row => ({
    no: row.id, productName: `${row.exam_name} ${names[row.product]}`, rightsName: names[row.product],
    createdAt: Date.parse(row.created_at), expiresAt: Date.parse(row.expires_at), paidAt: row.paid_at ? Date.parse(row.paid_at) : undefined,
    amount: (row.amount_cents / 100).toFixed(2), status: row.status === 'pending_payment' ? 'pending' : ['paid','refunding'].includes(row.status) ? 'completed' : 'closed',
    backendStatus: row.status, paymentMethod: row.paid_at ? '微信测试支付（未扣款）' : undefined,
    validity: row.product === 'trial' ? '付款成功后24小时' : '至对应考期结束，具体日期以考试配置为准', closeReason: row.close_reason,
  }))
  persistOrders(orders)
  return orders
}
export const normalizeOrders = (orders: RightsOrder[], _now = Date.now()) => orders
export const sortOrders = (orders: RightsOrder[]) => {
  const priority = { pending: 0, completed: 1, closed: 2 }
  return [...orders].sort((a,b) => priority[a.status]-priority[b.status] || b.createdAt-a.createdAt)
}
export const getActivePendingOrder = (orders: RightsOrder[]) => orders.find(o => o.status === 'pending')
export const createRightsOrder = (..._args: any[]): RightsOrder => { throw new Error('请通过服务器创建订单') }
