import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class ChoosrStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---- ENV / NAME PREFIXES (dev) ----
    const envName = "dev";
    const prefix = `choosr-${envName}`;

    /**
     * Cognito: User Pool + App Client (JWT for mobile)
     */
    const userPool = new cognito.UserPool(this, "ChoosrUserPool", {
      userPoolName: `${prefix}-user-pool`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // dev only
    });

    const userPoolClient = new cognito.UserPoolClient(
      this,
      "ChoosrUserPoolClient",
      {
        userPool,
        userPoolClientName: `${prefix}-mobile`,
        generateSecret: false, // public client for mobile
        authFlows: {
          userSrp: true,
          userPassword: true,
        },
      }
    );

    /**
     * DynamoDB (single-table)
     */
    const table = new dynamodb.Table(this, "ChoosrTable", {
      tableName: `${prefix}-main`,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // dev only
    });

    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    table.addGlobalSecondaryIndex({
      indexName: "GSI2",
      partitionKey: { name: "GSI2PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI2SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    /**
     * Outputs (we will paste these into backend + mobile config)
     */
    new cdk.CfnOutput(this, "EnvName", { value: envName });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "DynamoTableName", { value: table.tableName });
  }
}