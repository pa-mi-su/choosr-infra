import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class ChoosrStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Cognito: User Pool + App Client (JWT for mobile)
     * - Start with email sign-in, can expand later
     */
    const userPool = new cognito.UserPool(this, "ChoosrUserPool", {
      userPoolName: "choosr-user-pool",
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
      removalPolicy: cdk.RemovalPolicy.DESTROY, // MVP/dev; switch to RETAIN for prod
    });

    const userPoolClient = new cognito.UserPoolClient(this, "ChoosrUserPoolClient", {
      userPool,
      userPoolClientName: "choosr-mobile",
      generateSecret: false, // mobile public client
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
    });

    /**
     * DynamoDB (single-table style)
     * PK/SK + a couple GSIs for access patterns:
     * - GSI1: lookup by decisionId (or group)
     * - GSI2: lookup memberships by user
     */
    const table = new dynamodb.Table(this, "ChoosrTable", {
      tableName: "choosr-main",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // MVP/dev; switch to RETAIN for prod
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

    // Outputs (so mobile/backend can reference them)
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "DynamoTableName", { value: table.tableName });
  }
}