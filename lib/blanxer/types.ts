export type BlanxerOrderListItem = {
  _id: string
  order_number: number
  created_at: string
  updated_at?: string
}

// Blanxer's order-detail response (GET /order/:store_id/:order_id) has many
// more fields (payment state, courier flags, comments...) — only what
// lib/blanxer/mapOrder.ts reads is declared here.
export type BlanxerApiOrderDetail = {
  _id: string
  order_number: number
  status: string
  customer: string
  customer_full_name: string
  customer_email: string
  customer_phone_number: string
  delivery_charge: number
  product_total_price: number
  ordered_products: {
    product_name: string
    variant_name?: string
    price: number
    quantity: number
    discount_amount?: number
  }[]
  discount: { d_value: number; d_type?: number }
  updated_at?: string
  customer_address_province?: string
  customer_address_city?: string
  customer_address?: string
  customer_address_landmark?: string
  shipment_tracking?: string
}
