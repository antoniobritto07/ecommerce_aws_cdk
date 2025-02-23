
import * as cdk from 'aws-cdk-lib'
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigateway from 'aws-cdk-lib/aws-apigateway' //lib para apigateway
import * as cwlogs from 'aws-cdk-lib/aws-logs' //lib para cloud watch
import { Construct } from 'constructs';

interface ECommerceApiStackProps extends cdk.StackProps {
  productsFetchHandler: lambdaNodeJS.NodejsFunction
  productsAdminHandler: lambdaNodeJS.NodejsFunction
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
    const productsFetchIntegration = new apigateway.LambdaIntegration(props.productsFetchHandler)
    const productsAdminIntegration = new apigateway.LambdaIntegration(props.productsAdminHandler)

    // GET "/products"
    const productsResource = api.root.addResource("products")
    productsResource.addMethod("GET", productsFetchIntegration)

    // GET "/products/{id}"
    const productIdResource = productsResource.addResource("{id}") //busca pelo id especificamente
    productIdResource.addMethod("GET", productsFetchIntegration)

    // POST "/products"
    productsResource.addMethod("POST", productsAdminIntegration)
    // PUT "/products/{id}"
    productIdResource.addMethod("PUT", productsAdminIntegration)
    // DELETE "/products/{id}"
    productIdResource.addMethod("DELETE", productsAdminIntegration)
  }
}