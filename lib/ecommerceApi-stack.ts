
import * as cdk from 'aws-cdk-lib'
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigateway from 'aws-cdk-lib/aws-apigateway' //lib para apigateway
import * as cwlogs from 'aws-cdk-lib/aws-logs' //lib para cloud watch
import { Construct } from 'constructs';

interface ECommerceApiStackProps extends cdk.StackProps {
  productsFetchHandler: lambdaNodeJS.NodejsFunction
  productsAdminHandler: lambdaNodeJS.NodejsFunction
  ordersHandler: lambdaNodeJS.NodejsFunction
}

export class ECommerceApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ECommerceApiStackProps) {
    super(scope, id, props);

    const logGroup = new cwlogs.LogGroup(this, "ECommerceApiLogs")

    const api = new apigateway.RestApi(
      this,
      "ECommerceApi",
      {
        restApiName: "ECommerceApi",
        cloudWatchRole: true,
        deployOptions: {
          accessLogDestination: new apigateway.LogGroupLogDestination(logGroup), // falando para o api gateway onde ele deve gerar os logs
          accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
            httpMethod: true,
            ip: true,
            protocol: true,
            requestTime: true,
            resourcePath: true,
            responseLength: true,
            status: true,
            caller: true,
            user: true
          })
        }
      }
    )

    //create Lambda Integrations
    this.createProductsService(props, api);
    this.createOrdersService(props, api)
  }

  private createProductsService(props: ECommerceApiStackProps, api: apigateway.RestApi) {
    const productsFetchIntegration = new apigateway.LambdaIntegration(props.productsFetchHandler);
    const productsAdminIntegration = new apigateway.LambdaIntegration(props.productsAdminHandler);

    // GET "/products"
    const productsResource = api.root.addResource("products");
    productsResource.addMethod("GET", productsFetchIntegration);

    // GET "/products/{id}"
    const productIdResource = productsResource.addResource("{id}"); //busca pelo id especificamente
    productIdResource.addMethod("GET", productsFetchIntegration);

    const productRequestValidator = new apigateway.RequestValidator(this, "ProductRequestValidator", {
      restApi: api,
      requestValidatorName: "ProductRequestValidator",
      validateRequestBody: true
    })

    const productModel = new apigateway.Model(this, "ProductModel", {
      modelName: "ProductModel",
      restApi: api,
      contentType: "application/json",
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          productName: {
            type: apigateway.JsonSchemaType.STRING,
          },
          code: {
            type: apigateway.JsonSchemaType.STRING,
          },
          price: {
            type: apigateway.JsonSchemaType.NUMBER,
          },
          model: {
            type: apigateway.JsonSchemaType.STRING,
          },
          productUrl: {
            type: apigateway.JsonSchemaType.STRING,
          }
        },
        required: ["productName", "code"]
      }
    })
    // POST "/products"
    productsResource.addMethod("POST", productsAdminIntegration, {
      requestValidator: productRequestValidator,
      requestModels: {
        "application/json": productModel
      }
    });
    // PUT "/products/{id}"
    productIdResource.addMethod("PUT", productsAdminIntegration, {
      requestValidator: productRequestValidator,
      requestModels: {
        "application/json": productModel
      }
    });
    // DELETE "/products/{id}"
    productIdResource.addMethod("DELETE", productsAdminIntegration);
  }

  private createOrdersService(props: ECommerceApiStackProps, api: apigateway.RestApi) {
    const ordersIntegration = new apigateway.LambdaIntegration(props.ordersHandler);
    const ordersResource = api.root.addResource("orders");

    // GET "/orders"
    // GET "/orders?email=antonio@gmail.com"
    // GET "/orders?email=antonio@gmail.com&orderId=123"
    ordersResource.addMethod("GET", ordersIntegration);

    // DELETE "/orders?email=antonio@gmail.com&orderId=123"
    const orderDeletionValidator = new apigateway.RequestValidator(this, "OrderDeletionValidator", {
      restApi: api,
      requestValidatorName: "OrderDeletionValidator",
      validateRequestParameters: true
    })
    ordersResource.addMethod("DELETE", ordersIntegration, {
      requestParameters: { //ensinando ao meu API Gateway quais parametros sao obrigatorios aqui
        'method.request.querystring.email': true,
        'method.request.querystring.orderId': true
      },
      requestValidator: orderDeletionValidator
    });

    // POST "/orders"
    const orderRequestValidator = new apigateway.RequestValidator(this, "OrderRequestValidator", {
      restApi: api,
      requestValidatorName: "OrderRequestValidator",
      validateRequestBody: true
    })
    const orderModel = new apigateway.Model(this, "OrderModel", {
      modelName: "OrderModel",
      restApi: api,
      contentType: "application/json",
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          email: {
            type: apigateway.JsonSchemaType.STRING,
          },
          productIds: {
            type: apigateway.JsonSchemaType.ARRAY,
            minItems: 1,
            items: {
              type: apigateway.JsonSchemaType.STRING,
            }
          },
          payment: {
            type: apigateway.JsonSchemaType.STRING,
            enum: ["CASH", "CREDIT_CARD", "DEBIT_CARD"]
          }
        },
        required: ["email", "productIds", "payment"]
      }
    })
    ordersResource.addMethod("POST", ordersIntegration, {
      requestValidator: orderRequestValidator,
      requestModels: {
        "application/json": orderModel
      }
    });
  }
}