import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
// aws-ssm - importante recurso da aws para guardar recursos - simplesmente um lugar onde a gente consegue guardar parâmetros dentro da AWS
import * as ssm from 'aws-cdk-lib/aws-ssm';


// nas Stacks Layers nao precisamos de atributo de classe já que a relação entre as stacks que usam os layers e as stacks de layers propriamente ditas nao sao atraves de referencia.
// ao inves de referencia, eles usam o ARN/SSM da AWS
export class ProductsAppLayersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const productsLayers = new lambda.LayerVersion(this, 'ProductsLayer', {
      code: lambda.Code.fromAsset('lambda/products/layers/productsLayer'), // caminho para onde o código da layer estará
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      layerVersionName: "ProductsLayer",
      removalPolicy: cdk.RemovalPolicy.RETAIN // mantém a Layer mesmo que a STACK seja removida (já que essa layer pode ser usada por outras stacks)
    })

    // basicamente isso diz que quando criamos uma layer, devemos armazenar uma versão dessa layer que 
    // poderá posteriormente ser usada por outras stacks, e armazenará essa versão no StringParameter.
    new ssm.StringParameter(this, "ProductsLayerVersionArn", {
      parameterName: "ProductsLayerVersionArn",
      stringValue: productsLayers.layerVersionArn,
    })

    const productEventsLayers = new lambda.LayerVersion(this, 'ProductEventsLayer', {
      code: lambda.Code.fromAsset('lambda/products/layers/productEventsLayer'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      layerVersionName: "ProductEventsLayer",
      removalPolicy: cdk.RemovalPolicy.RETAIN
    })

    new ssm.StringParameter(this, "ProductEventsLayerVersionArn", {
      parameterName: "ProductEventsLayerVersionArn",
      stringValue: productEventsLayers.layerVersionArn,
    })
  }
}