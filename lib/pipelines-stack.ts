import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { CodePipeline, CodePipelineSource, ShellStep, CodeBuildStep, ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { LogGroupNestedStack } from './logging/log-group-nestedstack';
import { S3NestedStack } from './storage/s3-nestedstack';
import { MyApplicationStage } from './cicd/my-application-stage';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

interface PipelinesProps extends cdk.StackProps {
    RepositoryOwner: string,
    RepositoryName: string,
    BranchName: string,
    Vpc?: ec2.IVpc,
    LogGroup?: logs.ILogGroup,
    removalPolicy: cdk.RemovalPolicy,
    SubDir?: string,
    artifactBucket?: s3.IBucket,
}

export class PipelinesStack extends cdk.Stack {

    public readonly pipeline: CodePipeline;

    constructor(scope: Construct, id: string, props: PipelinesProps) {
        super(scope, id, props);

        props.LogGroup = new LogGroupNestedStack(this, 'LogGroupNestedStack',
            { removalPolicy: props.removalPolicy, retention: logs.RetentionDays.ONE_WEEK }).logGroup

        props.artifactBucket = new S3NestedStack(this, 'ArtifactBucketNestedStack', {
            removalPolicy: props.removalPolicy,
            autoDeleteObjects: true,
            bucketName: cdk.PhysicalName.GENERATE_IF_NEEDED,
        }).bucket

        /*
        const AssetBucket = new s3deploy.BucketDeployment(this, 'AssetBucket', {
            sources: [s3deploy.Source.asset('./assets')],
            destinationBucket: props.artifactBucket,
            destinationKeyPrefix: 'scripts', // optional prefix in destination bucket
            retainOnDelete: false,
        });
        const AssetArtifact = new Artifact(
            {
                artifactName: 'AssetArtifact',
            }
        );
        */

        const source = CodePipelineSource.gitHub(props.RepositoryOwner + '/' + props.RepositoryName, props.BranchName)
        const synthStep = new ShellStep('Synth', {
            input: source,
            // installCommands: ['npm i -g npm@latest'],
            commands:
                [`pwd`,
                    'npm ci', `npx cdk --version`,
                    'npm run build',
                    `npx cdk synth ${this.stackName}`],
            /*
             * We need to define 'primaryOutputDirectory' because
             * our CDK app is not in the root of the project structure.
             */
            // primaryOutputDirectory: `${props.SubDir}/cdk.out`,
        })

        this.pipeline = new CodePipeline(this, 'Pipeline', {
            pipelineName: 'MyPipeline',
            selfMutation: true,

            artifactBucket: props.artifactBucket,

            synth: synthStep,
            codeBuildDefaults: {
                // cache: codebuild.Cache.local(codebuild.LocalCacheMode.CUSTOM),

                buildEnvironment: {
                    // privileged: true,
                    buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
                    computeType: codebuild.ComputeType.MEDIUM,
                },
                partialBuildSpec: codebuild.BuildSpec.fromObject({
                    env: {
                        variables: {
                            // CDK env variables propagation
                            GIT_BRANCH: props.BranchName,
                            // NODE_VERSION: '16',
                        },
                    },
                    version: "0.2",
                    phases: {
                        install: {
                            "runtime-versions": {
                                nodejs: "latest",
                            },
                        },
                    },
                }),
                logging: {
                    cloudWatch: {
                        logGroup: props.LogGroup,
                    }
                },
            },
        });

        /**
         *
         * Add Testing wave
         *
         */
        const testingWave = this.pipeline.addWave('Testing')
        testingWave.addStage(new MyApplicationStage(this, 'TestingStageAlpha',
            {
                removalPolicy: props.removalPolicy,
            })).addPost(
                new CodeBuildStep('RunIntegrationTests', {
                    input: synthStep,
                    installCommands: [],
                    commands: [
                        'echo "Let\'s run some integration tests!!"',
                        "pwd",
                        "ls",                        
                        "tree",
                        "cat tree.json",
                        "Invoke-Command -FilePath '..\\assets\\scripts\\simple.ps1'"
                    ],
                    buildEnvironment: {
                        buildImage: codebuild.WindowsBuildImage.fromDockerRegistry(
                            "mcr.microsoft.com/dotnet/framework/sdk:4.8", {},
                            codebuild.WindowsImageType.SERVER_2019,
                        ),
                    },
                    // primaryOutputDirectory: `${props.SubDir}/cdk.out`,
                }),
            )
        testingWave.addStage(new MyApplicationStage(this, 'TestingStageBeta',
            {
                removalPolicy: props.removalPolicy,
            })).addPost(
                new ShellStep('RunSmokeTests', {
                    input: source,
                    installCommands: [
                        'ls -la', `pwd`,
                    ],
                    commands: [
                        'echo "Let\'s run some smoke tests!!"'
                    ],
                    env: {},
                    // primaryOutputDirectory: `${props.SubDir}/cdk.out`,
                }),
            )
        testingWave.addStage(new MyApplicationStage(this, 'TestingStageGamma',
            {
                removalPolicy: props.removalPolicy,
            }))

        /**
         *
         * Add Release wave
         *
         */
        const releaseWave = this.pipeline.addWave('Release')
        releaseWave.addStage(
            new MyApplicationStage(this, 'ProductionStage',
                {
                    removalPolicy: props.removalPolicy,
                }),
            {
                pre: [
                    // new ManualApprovalStep('PromoteToProd'),
                ],
            }
        )
    }
}
