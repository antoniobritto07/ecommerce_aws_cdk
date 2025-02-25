export enum PaymentType {
  CASH = "CASH",
  CREDIT_CARD = "CREDIT_CARD",
  DEDIT_CARD = "DEBIT_CARD",
}

export enum ShippingType {
  ECONOMIC = "ECONOMIC",
  URGENT = "URGENT",
}

export enum CarrierType {
  CORREIOS = "CORREIOS",
  SEDEX = "SEDEX",
}

//modelo de requisição de criação de pedidos
export interface OrderRequest {
  email: string;
  productIds: string[];
  payment: PaymentType;
  shipping: {
    type: ShippingType;
    carrier: CarrierType;
  }
}

export interface OrderProductResponse {
  code: string
  price: number
}

//modelo de requisição de busca de pedidos
export interface OrderResponse {
  email: string;
  id: string;
  createdAt: number;
  billing: {
    payment: PaymentType;
    totalPrice: number;
  },
  shipping: {
    type: ShippingType;
    carrier: CarrierType;
  },
  products: OrderProductResponse[]
}