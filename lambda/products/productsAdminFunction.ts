import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { Product, ProductRepository } from "/opt/nodejs/productsLayer"
import { DynamoDB, Lambda } from "aws-sdk"
import { ProductEvent, ProductEventType } from "/opt/nodejs/productEventsLayer";
import * as AWSXRay from "aws-xray-sdk"

AWSXRay.captureAWS(require("aws-sdk")) //xray vai capturar e monitorar o tempo gasto em todas operações que usam o SDK

const productsDdb = process.env.PRODUCTS_DDB!
const productEventsFunctionName = process.env.PRODUCT_EVENTS_FUNCTION_NAME!

const ddbClient = new DynamoDB.DocumentClient()
const lambdaClient = new Lambda() // precisamos disso para invocar uma segunda função

const productRepository = new ProductRepository(ddbClient, productsDdb)

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const lambdaRequestId = context.awsRequestId
  const apiRequestId = event.requestContext.requestId

  console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`)

  if (event.resource === "/products") {
    console.log("POST /products")

    const product = JSON.parse(event.body!) as Product
    const productCreated = await productRepository.createProduct(product)

    //caso a invocacao for do tipo síncrona, podemos pegar o retorno da funcao invocada aqui
    const response = await sendProductEvent(
      productCreated,
      ProductEventType.CREATED,
      "antonio_created@gmail.com",
      lambdaRequestId
    )

    console.log(`Response funcao invocada: ${response}`)
    return {
      statusCode: 201,
      body: JSON.stringify(productCreated),
    };
  } else if (event.resource === "/products/{id}") {
    const productId = event.pathParameters!.id as string

    if (event.httpMethod === "PUT") {
      console.log(`PUT /products/${productId}`)
      const product = JSON.parse(event.body!) as Product
      try {
        const productUpdated = await productRepository.updateProduct(productId, product)

        const response = await sendProductEvent(
          productUpdated,
          ProductEventType.UPDATED,
          "antonio_updated@gmail.com",
          lambdaRequestId
        )
        console.log(`Response funcao invocada: ${response}`)

        return {
          statusCode: 200,
          body: JSON.stringify(productUpdated),
        }
      } catch (ConditionalCheckFailedException) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Product not found" }),
        }
      }
    } else if (event.httpMethod === "DELETE") {
      console.log(`DELETE /products/${productId}`)
      try {
        const productDeleted = await productRepository.deleteProduct(productId)
        const response = await sendProductEvent(
          productDeleted,
          ProductEventType.DELETED,
          "antonio_deleted@gmail.com",
          lambdaRequestId
        )
        console.log(`Response funcao invocada: ${response}`)

        return {
          statusCode: 200,
          body: JSON.stringify(productDeleted),
        }
      } catch (error) {
        console.error((<Error>error).message)
        return {
          statusCode: 404,
          body: JSON.stringify((<Error>error).message),
        }
      }
    }
  }

  return {
    statusCode: 400,
    body: JSON.stringify({ message: "bad request" }),
  }
}

function sendProductEvent(
  product: Product,
  eventType: ProductEventType,
  email: string,
  lambdaRequestId: string
) {
  const event: ProductEvent = {
    email: email,
    eventType: eventType,
    productCode: product.code,
    productId: product.id,
    productPrice: product.price,
    requestId: lambdaRequestId,
  }

  return lambdaClient.invoke({ //operacao para invokar uma outra funcao
    FunctionName: productEventsFunctionName,
    Payload: JSON.stringify(event),
    InvocationType: "RequestResponse" // execucao síncrona - funcao de admin irá aguardar a conclusao da invocacao da funcao de eventos
  }).promise()
}