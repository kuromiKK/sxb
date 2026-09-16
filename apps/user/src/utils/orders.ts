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
    no: row.id, productName: row.product_snapshot?.frontendTitle || row.product_snapshot?.title || `${row.exam_name} ${names[row.product]}`, rightsName: row.product_snapshot?.level?.toUpperCase() || names[row.product],
    createdAt: Date.parse(row.created_at), expiresAt: Date.parse(row.expires_at), paidAt: row.paid_at ? Date.parse(row.paid_at) : undefined,
    amount: (row.amount_cents / 100).toFixed(2), status: row.status === 'pending_payment' ? 'pending' : ['paid','refunding'].includes(row.status) ? 'completed' : 'closed',
    backendStatus: row.status, paymentMethod: row.paid_at ? ({wechat:'微信支付',alipay:'支付宝支付',alipay_sandbox:'支付宝沙箱（未扣款）',wechat_test:'微信测试支付（未扣款）'} as Record<string,string>)[row.payment_method]||'支付已确认' : undefined,
    validity: row.entitlement_revoked ? '此订单权益已撤销' : row.entitlement_ends_at ? '有效至 '+new Date(row.entitlement_ends_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) : row.product_snapshot ? (row.product==='trial'?`付款成功后最多 ${row.product_snapshot.trialHours} 小时，最晚至 `:'有效至 ')+new Date(row.product_snapshot.endsAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) : '至订单对应考期结束', closeReason: row.close_reason,
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
