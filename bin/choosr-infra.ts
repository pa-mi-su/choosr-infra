#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ChoosrStack } from "../lib/choosr-stack";

const app = new cdk.App();

new ChoosrStack(app, "ChoosrStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});