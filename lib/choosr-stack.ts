import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";

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
      },
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

    // ---- Lambda: HTTP API (Go) ----
    // Use an absolute path so bundling is stable regardless of where CDK is run from.
    const backendPath = path.resolve(__dirname, "../../choosr-backend");

    const httpApiFn = new lambda.Function(this, "ChoosrHttpApiFn", {
      functionName: `${prefix}-httpapi`,
      runtime: lambda.Runtime.PROVIDED_AL2023,
      handler: "bootstrap",
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      code: lambda.Code.fromAsset(backendPath, {
        bundling: {
          image: lambda.Runtime.PROVIDED_AL2023.bundlingImage,

          // ✅ Key fix: avoid UID mapping + permission problems
          user: "root",

          command: [
            "bash",
            "-lc",
            [
              "set -euo pipefail",
              "cd cmd/httpapi",
              // ✅ keep all Go caches in writable space
              "export HOME=/tmp",
              "export TMPDIR=/tmp",
              "export GOCACHE=/tmp/go-build",
              "export GOMODCACHE=/tmp/gomod",
              "export GOPATH=/tmp/go",
              "GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o /asset-output/bootstrap",
            ].join(" && "),
          ],
        },
      }),
      environment: {
        ENV: envName,
        DDB_TABLE: table.tableName,
      },
    });

    table.grantReadWriteData(httpApiFn);

    // ---- HTTP API Gateway ----
    const httpApi = new apigwv2.HttpApi(this, "ChoosrHttpApi", {
      apiName: `${prefix}-http-api`,
    });

    const httpIntegration = new integrations.HttpLambdaIntegration(
      "ChoosrHttpIntegration",
      httpApiFn,
    );

    httpApi.addRoutes({
      path: "/health",
      methods: [apigwv2.HttpMethod.GET],
      integration: httpIntegration,
    });

    httpApi.addRoutes({
      path: "/v1/decisions",
      methods: [apigwv2.HttpMethod.POST],
      integration: httpIntegration,
    });

    new cdk.CfnOutput(this, "HttpApiUrl", { value: httpApi.url! });

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
