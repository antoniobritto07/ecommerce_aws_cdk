import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { OrderRepository, Order } from "/opt/nodejs/ordersLayer";
import { ProductRepository, Product } from "/opt/nodejs/productsLayer"
import { DynamoDB } from "aws-sdk"
import * as AWSXRay from "aws-xray-sdk"
import {
  CarrierType,
  OrderProductResponse,
  OrderRequest,
  OrderResponse,
  PaymentType,
  ShippingType
} from "/opt/nodejs/ordersApiLayer";

AWSXRay.captureAWS(require("aws-sdk"))

const ordersDdb = process.env.ORDERS_DDB!
const productsDdb = process.env.PRODUCTS_DDB!

const ddbClient = new DynamoDB.DocumentClient()

const orderRepository = new OrderRepository(ddbClient, ordersDdb)
const productRepository = new ProductRepository(ddbClient, productsDdb)

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const apiRequestId = event.requestContext.requestId
  const lambdaRequestId = context.awsRequestId

  console.log(`API Gateway RequestId: ${apiRequestId} - LambdaRequestId: ${lambdaRequestId}`)

  if (method === "GET") {
    if (event.queryStringParameters) {
      const email = event.queryStringParameters!.email
      const orderId = event.queryStringParameters!.orderId
      if (email && orderId) {
        try {
          const order = await orderRepository.getOrder(email, orderId)
          return {
            statusCode: 200,
            body: JSON.stringify(convertToOrderResponse(order)),
          }
        } catch (error) {
          console.log((<Error>error).message)
          return {
            statusCode: 404,
            body: (<Error>error).message,
          }
        }
      } else {
        const orders = await orderRepository.getOrderByEmail(email!)
        return {
          statusCode: 200,
          body: JSON.stringify(orders.map(convertToOrderResponse)),
        }
      }

    } else {
      const orders = await orderRepository.getAllOrders()
      return {
        statusCode: 200,
        body: JSON.stringify(orders.map(convertToOrderResponse)),
      }
    }

  } else if (method === "POST") {
    console.log('POST /orders')
    const orderRequest = JSON.parse(event.body!) as OrderRequest
    const products = await productRepository.getProductsByIds(orderRequest.productIds)
    if (products.length === orderRequest.productIds.length) {
      const order = buildOrder(orderRequest, products)
      const orderCreated = await orderRepository.createOrder(order)

      return {
        statusCode: 201,
        body: JSON.stringify(convertToOrderResponse(orderCreated)),
      }
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Products not found" }),
      }
    }

  } else if (method === "DELETE") {
    console.log('DELETE /orders')
    //estamos garantindo que o email como query parameter string virá já que já validamos isso na camada da API Gateway
    const email = event.queryStringParameters!.email
    const orderId = event.queryStringParameters!.orderId

    try {
      const orderDeleted = await orderRepository.deleteOrder(email!, orderId!)

      return {
        statusCode: 200,
        body: JSON.stringify(convertToOrderResponse(orderDeleted)),
      }
    } catch (error) {
      console.log((<Error>error).message)
      return {
        statusCode: 404,
        body: (<Error>error).message,
      }
    }
  }

  return {
    statusCode: 400,
    body: JSON.stringify({ message: "Bad request" }),
  }
}

function convertToOrderResponse(order: Order): OrderResponse {
  const orderProducts: OrderProductResponse[] = []
  order.products.forEach(product => {
    orderProducts.push({
      code: product.code,
      price: product.price,
    })
  })
  const orderResponse: OrderResponse = {
    email: order.pk,
    id: order.sk!,
    createdAt: order.createdAt!,
    products: orderProducts,
    billing: {
      payment: order.billing.payment as PaymentType,
      totalPrice: order.billing.totalPrice,
    },
    shipping: {
      type: order.shipping.type as ShippingType,
      carrier: order.shipping.carrier as CarrierType,
    },
  }

  return orderResponse;
}

function buildOrder(orderRequest: OrderRequest, products: Product[]): Order {
  const orderProducts: OrderProductResponse[] = []
  const totalPrice = products.reduce((acc, product) => acc + product.price, 0);

  console.log(products, 'products')
  products.forEach(product => {
    orderProducts.push({
      code: product.code,
      price: product.price,
    })
  })

  const order: Order = {
    pk: orderRequest.email,
    billing: {
      payment: orderRequest.payment,
      totalPrice: totalPrice,
    },
    shipping: {
      type: orderRequest.shipping.type,
      carrier: orderRequest.shipping.carrier,
    },
    products: orderProducts
  }

  return order;
}