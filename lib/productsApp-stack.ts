// todos os recursos relacionados a PRODUCTs estarão dentro da mesma STACK.
// isso faz sentido para manter tudo centralizado.
// os recursos são por exemplo: tabela de Produtos no DynamoDB, função Lambda de consultar dados na tabela
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ssm from 'aws-cdk-lib/aws-ssm'; //lib necessária para ler as aws layers
import { Construct } from 'constructs';

interface ProductsAppStackProps extends cdk.StackProps {
  eventsDdb: dynamodb.Table
}

export class ProductsAppStack extends cdk.Stack {
  readonly productsFetchHandler: lambdaNodeJS.NodejsFunction;
  readonly productsAdminHandler: lambdaNodeJS.NodejsFunction;
  readonly productsDdb: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ProductsAppStackProps) {
    super(scope, id, props); // sscope basicamente é onde uma STACK está inserida

    this.productsDdb = new dynamodb.Table(this, "ProductsDdb", {
      tableName: "products",
      removalPolicy: cdk.RemovalPolicy.DESTROY, // define o que acontece com a tabela caso STACK seja excluída
      partitionKey: { //define a chave primária da tabela
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED, // modo de cobrança (provisionado ou sob demanda)
      readCapacity: 1, // define quanto a tabela pode receber de requisições de leitura por segundo (padrão é 5) 
      writeCapacity: 1 // define quanto a tabela pode receber de requisições de escrita por segundo (padrão é 5)
    })

    //Product Layer
    const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersionArn")
    const productLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn)

    //Product Events Layer
    const productEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductEventsLayerVersionArn")
    const productEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductEventsLayerVersionArn", productEventsLayerArn)

    const productEventsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "ProductEventsFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "ProductEventsFunction",
        entry: "lambda/products/productEventsFunction.ts",
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
        layers: [productEventsLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
      })
    props.eventsDdb.grantWriteData(productEventsHandler)

    this.productsFetchHandler = new lambdaNodeJS.NodejsFunction(
      this, // scope dela será o próprio scope onde ela está inserida
      "ProductsFetchFunction", // identificação da função dentro dessa stack
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "ProductsFetchFunction", // nome da função que aparecerá no console da aws
        entry: "lambda/products/productsFetchFunction.ts", // nome do arquivo que será invocado
        handler: "handler", // nome do método que estará dentro do arquivo que será invocado
        memorySize: 512, // quantidade de memória que quero alocar para essa execução da função
        timeout: cdk.Duration.seconds(5), // tempo de execução máximo para essa função
        bundling: { //passa algumas instruções sobre como função será deployada para aws
          minify: true, //deixa o código o mais simples possível (tempo de montagem)
          sourceMap: false,
          nodeModules: [
            'aws-xray-sdk-core'
          ]
        },
        environment: { // define variáveis de ambiente que a função vai usar
          PRODUCTS_DDB: this.productsDdb.tableName,
        },
        layers: [productLayer], // passa a layer que a função vai usar
        tracing: lambda.Tracing.ACTIVE, // função terá permissões para gerar traços no X-Ray
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
      })
    //assim que a gente dá acesso de leitura no banco de dados para uma determinada função
    // a forma com que um recurso que tem direito de acessar um outro recurso da AWS
    this.productsDdb.grantReadData(this.productsFetchHandler)

    this.productsAdminHandler = new lambdaNodeJS.NodejsFunction(
      this, // scope dela será o próprio scope onde ela está inserida
      "ProductsAdminFunction", // identificação da função dentro dessa stack
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: "ProductsAdminFunction",
        entry: "lambda/products/productsAdminFunction.ts",
        handler: "handler",
        memorySize: 512,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: [
            'aws-xray-sdk-core'
          ]
        },
        environment: {
          PRODUCTS_DDB: this.productsDdb.tableName,
          PRODUCT_EVENTS_FUNCTION_NAME: productEventsHandler.functionName
        },
        layers: [productLayer, productEventsLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
      })
    this.productsDdb.grantWriteData(this.productsAdminHandler) //garante acesso de escrita dentro da tabela do DynameDB
    productEventsHandler.grantInvoke(this.productsAdminHandler) //garante acesso de invocar a função para a função de administração
  }
}