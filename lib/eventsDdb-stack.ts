import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"

export class EventsDdbStack extends cdk.Stack {
  readonly table: dynamodb.Table

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, "EventsDdb", {
      tableName: "events",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: "ttl", // atributo para dizer para a tabela que os dados, depois de um determinado tempo, serão apagados do banco de dados
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });
    const readScale = this.table.autoScaleReadCapacity({
      maxCapacity: 2,
      minCapacity: 1
    })
    readScale.scaleOnUtilization({
      targetUtilizationPercentage: 50,
      scaleInCooldown: cdk.Duration.seconds(60)
    })
    const writeScale = this.table.autoScaleWriteCapacity({
      maxCapacity: 4,
      minCapacity: 1
    })
  }
}