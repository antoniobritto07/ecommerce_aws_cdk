import { DocumentClient } from "aws-sdk/clients/dynamodb"
import { v4 as uuid } from "uuid"

export interface Product {
  id: string;
  productName: string;
  code: string;
  price: number;
  model: string;
  productUrl: string;
}

export class ProductRepository {
  private ddbClient: DocumentClient
  private productsDdb: string

  constructor(ddbClient: DocumentClient, productsDdb: string) {
    this.ddbClient = ddbClient
    this.productsDdb = productsDdb
  }
  async getAllProducts(): Promise<Product[]> {
    const data = await this.ddbClient.scan({
      TableName: this.productsDdb,
    }).promise() // essa operação de scan não retorna uma promise por padrão, por isso que temos que colocar o .promises no final

    return data.Items as Product[]
  }

  async getProductById(productId: string): Promise<Product> {
    const data = await this.ddbClient.get({
      TableName: this.productsDdb,
      Key: {
        id: productId
      },
    }).promise()

    if (data.Item) {
      return data.Item as Product
    } else {
      throw new Error(`Product with id ${productId} not found`)
    }
  }

  async createProduct(product: Product): Promise<Product> {
    product.id = uuid()
    await this.ddbClient.put({
      TableName: this.productsDdb,
      Item: product,
    }).promise()

    return product
  }

  async deleteProduct(productId: string): Promise<Product> {
    const data = await this.ddbClient.delete({
      TableName: this.productsDdb,
      Key: {
        id: productId
      },
      ReturnValues: "ALL_OLD" //retorna tudo que estava na tabela antes de ter feito de fato a operação
    }).promise()

    if (data.Attributes) {
      return data.Attributes as Product
    } else {
      throw new Error(`Product with id ${productId} not found`)
    }
  }

  async updateProduct(productId: string, product: Product): Promise<Product> {
    const data = await this.ddbClient.update({
      TableName: this.productsDdb,
      Key: {
        id: productId
      },
      ConditionExpression: 'attribute_exists(id)', // apenas executa operação caso o id seja encontrado
      ReturnValues: "UPDATED_NEW", //retorna tudo novo que foi inserido na tabela
      UpdateExpression: "SET productName = :name, code = :code, price = :price, model = :model, productUrl = :productUrl",
      ExpressionAttributeValues: {
        ":name": product.productName,
        ":code": product.code,
        ":price": product.price,
        ":model": product.model,
        ":productUrl": product.productUrl,
      }
    }).promise()

    data.Attributes!.id = productId
    return data.Attributes as Product
  }
}