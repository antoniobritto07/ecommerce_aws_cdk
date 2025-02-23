import * as dotenv from "dotenv";
dotenv.config();
import * as cdk from 'aws-cdk-lib';
import { ProductsAppStack } from '../lib/productsApp-stack'
import { ECommerceApiStack } from '../lib/ecommerceApi-stack'
import { ProductsAppLayersStack } from '../lib/productsAppLayers-stack'
import { EventsDdbStack } from '../lib/eventsDdb-stack';

const app = new cdk.App();

// variamos essas configuracoes de acordo com o ambiente que estamos trabalhando (local, test, prod, ...)
const env: cdk.Environment = {
  account: process.env.AWS_ACCOUNT ?? "default_value",
  region: process.env.AWS_REGION ?? "default_value"
};

const tags = {
  cost: process.env.AWS_COST ?? "default_value",
  team: process.env.AWS_TEAM ?? "default_value",
}

const productsAppLayersStack = new ProductsAppLayersStack(app, "ProductsAppLayers", {
  tags: tags,
  env: env
})

const eventsDdbStack = new EventsDdbStack(app, "EventsDdb", {
  tags: tags,
  env: env
})

const productsAppStack = new ProductsAppStack(app, "ProductsApp", {
  eventsDdb: eventsDdbStack.table,
  tags: tags,
  env: env
})
productsAppStack.addDependency(productsAppLayersStack) //stack de produtos dependende da stack de layers de produto
productsAppStack.addDependency(eventsDdbStack) //stack de produtos dependende da stack de bando de dados de eventos

const eCommerceApiStack = new ECommerceApiStack(app, "ECommerceApi", {
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
  tags: tags,
  env: env
})
eCommerceApiStack.addDependency(productsAppStack) //deixa explícito para o CDK que uma stack aqui depende da outra
