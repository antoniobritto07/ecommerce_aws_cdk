import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sns from 'aws-cdk-lib/aws-sns'
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions'
import * as iam from "aws-cdk-lib/aws-iam"
import { Construct } from 'constructs';

interface OrdersAppStackProps extends cdk.StackProps {
  productsDdb: dynamodb.Table,
  eventsDdb: dynamodb.Table
}
export class OrdersAppStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodeJS.NodejsFunction;

  constructor(scope: Construct, id: string, props: OrdersAppStackProps) {
    super(scope, id, props);

    const ordersDdb = new dynamodb.Table(this, "OrdersDdb", {
      tableName: "orders",
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    })

    //Orders Layer
    const ordersLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrdersLayerVersionArn")
    const orderLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrdersLayerVersionArn", ordersLayerArn)

    //Orders Api Layer
    const ordersApiLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrdersApiLayerVersionArn")
    const orderApiLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrdersApiLayerVersionArn", ordersApiLayerArn)

    //Product Layer
    const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersionArn")
    const productLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn)

    //Order Events Layer
    const orderEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrderEventsLayerVersionArn")
    const orderEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrderEventsLayerVersionArn", orderEventsLayerArn)

    //Order Events Repository Layer
    const orderEventsRepositoryLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrderEventsRepositoryLayerVersionArn")
    const orderEventsRepositoryLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrderEventsRepositoryLayerVersionArn", orderEventsRepositoryLayerArn)

    // SNS
    const ordersTopic = new sns.Topic(this, "OrderEventsTopic", {
      displayName: "Order events topic",
      topicName: "order-events"
    })

    this.ordersHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "OrdersFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "OrdersFunction",
        entry: "lambda/orders/ordersFunction.ts",
        handler: "handler",
        memorySize: 512,
        timeout: cdk.Duration.seconds(2),
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: [
            'aws-xray-sdk-core'
          ]
        },
        environment: {
          PRODUCTS_DDB: props.productsDdb.tableName,
          ORDERS_DDB: ordersDdb.tableName,
          ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn //precisamos passar o arn do tópico sns para dentro da função lambda
        },
        layers: [orderLayer, productLayer, orderApiLayer, orderEventsLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
      })
    ordersDdb.grantReadWriteData(this.ordersHandler)
    props.productsDdb.grantReadData(this.ordersHandler) //damos apenas acesso de leitura para esse funcao, a um outro DB que está em outro serviço
    ordersTopic.grantPublish(this.ordersHandler) // dando à funcao de pedidos permissao para publicar tópicos no SNS

    const orderEventsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "OrderEventsFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "OrderEventsFunction",
        entry: "lambda/orders/orderEventsFunction.ts",
        handler: "handler",
        memorySize: 512,
        timeout: cdk.Duration.seconds(2),
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: [
            'aws-xray-sdk-core'
          ]
        },
        environment: {
          EVENTS_DDB: props.eventsDdb.tableName
        },
        layers: [orderEventsLayer, orderEventsRepositoryLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
      })
    ordersTopic.addSubscription(new subs.LambdaSubscription(orderEventsHandler)) // garante que funcao orderEventsHandler está inscrita para receber eventos do tópicos

    // criando uma política de permissao falando que essa lambda function orderEventsHandler pode apenas INSERIR eventos dentro da tabela (única operação permitida)
    // além disso passamos uma condicao falando que pode apenas criar documentos onde a chave primária dessa tabela comece com o "#order_*"
    const eventsDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [props.eventsDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKeys': ['#order_*']
        }
      }
    })
    orderEventsHandler.addToRolePolicy(eventsDdbPolicy) // adiciona política/papel para essa funcao 

    const billingHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "BillingsFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "BillingFunction",
        entry: "lambda/orders/billingFunction.ts",
        handler: "handler",
        memorySize: 512,
        timeout: cdk.Duration.seconds(2),
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: [
            'aws-xray-sdk-core'
          ]
        },
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
      })
    // filtrando essa lambda function para receber apenas dados do SNS quando estivermos lidando com criação de dados
    ordersTopic.addSubscription(new subs.LambdaSubscription(billingHandler, {
      filterPolicy: {
        "eventType": sns.SubscriptionFilter.stringFilter({
          allowlist: ['ORDER_CREATED']
        })
      }
    }))
  }
}