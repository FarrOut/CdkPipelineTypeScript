#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelinesStack } from '../lib/pipelines-stack';

const app = new cdk.App();

const default_env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
}

new PipelinesStack(app, 'Pipelines', {
  env: default_env,

  BranchName: 'dev',
  RepositoryOwner: 'FarrOut',
  RepositoryName: 'CdkPipelineTypeScript',
  removalPolicy: cdk.RemovalPolicy.DESTROY,  
});