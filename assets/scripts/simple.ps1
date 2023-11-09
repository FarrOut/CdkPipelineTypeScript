"Write-Output $env:CODEBUILD_SOURCE_VERSION",
"Write-Output $CODEBUILD_RESOLVED_SOURCE_VERSION",
'$bucketName = ($env:CODEBUILD_SOURCE_VERSION -split "arn:aws:s3:::").Split("/")[1]',
"Write-Output $bucketName",