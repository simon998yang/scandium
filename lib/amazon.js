const APIGateway = require('aws-sdk/clients/apigateway')
const IAM = require('aws-sdk/clients/iam')
const Lambda = require('aws-sdk/clients/lambda')
const bytes = require('bytes')
const parseArn = require('aws-arn-parser')
const shortid = require('shortid')
const pRetry = require('p-retry')

const UserError = require('./user-error')

const lambda = new Lambda({ apiVersion: '2015-03-31' })
const apiGateway = new APIGateway({ apiVersion: '2015-07-09' })
const iam = new IAM({ apiVersion: '2010-05-08' })

const MAX_LAMBDA_ZIP_SIZE = bytes.parse('50mb')

const defaultParams = {
  MemorySize: 320,
  Timeout: 3,
  Runtime: 'nodejs8.10'
}

function verifyZipFile (zipFile) {
  if (!zipFile) throw new Error('Missing zipFile')
  if (zipFile.byteLength >= MAX_LAMBDA_ZIP_SIZE) throw new Error(`Lambda size exceeded, ${bytes.format(zipFile.byteLength)}, current max size is ${bytes.format(MAX_LAMBDA_ZIP_SIZE)}`)
}

function addPermission ({ lambdaArn, restApiId }) {
  const { region, namespace } = parseArn(lambdaArn)

  const params = {
    Action: 'lambda:InvokeFunction',
    FunctionName: lambdaArn,
    Principal: 'apigateway.amazonaws.com',
    StatementId: `${shortid.generate()}-AllowExecutionFromAPIGateway`,
    SourceArn: `arn:aws:execute-api:${region}:${namespace}:${restApiId}/*/*/*`
  }

  return lambda.addPermission(params).promise()
}

exports.createFunction = function ({ zipFile, functionName, role, environment, onFailedAttempt }) {
  verifyZipFile(zipFile)

  const params = {
    Code: { ZipFile: zipFile },
    FunctionName: functionName,
    Handler: 'scandium-entrypoint.handler',
    MemorySize: defaultParams.MemorySize,
    Publish: true,
    Role: role,
    Runtime: defaultParams.Runtime,
    Timeout: defaultParams.Timeout,
    Environment: (environment ? { Variables: environment } : undefined)
  }

  return pRetry(() => lambda.createFunction(params).promise(), { minTimeout: 2000, factor: 3, retries: 5, onFailedAttempt }).then(res => res.FunctionArn)
}

function updateRuntime ({ functionName }) {
  const params = {
    FunctionName: functionName,
    Runtime: defaultParams.Runtime
  }

  return lambda.updateFunctionConfiguration(params).promise().then(res => res.FunctionArn)
}

exports.updateFunction = async function ({ zipFile, functionName }) {
  verifyZipFile(zipFile)

  const params = {
    FunctionName: functionName,
    Publish: true,
    ZipFile: zipFile
  }

  const result = await lambda.updateFunctionCode(params).promise()

  if (result.Runtime !== defaultParams.Runtime) {
    return updateRuntime({ functionName })
  }

  return result.FunctionArn
}

exports.getFunctionEnvironment = function ({ functionName }) {
  const params = {
    FunctionName: functionName
  }

  return lambda.getFunctionConfiguration(params).promise().then(res => (res.Environment && res.Environment.Variables) || {})
}

exports.updateFunctionEnvironment = function ({ functionName, environment }) {
  const params = {
    FunctionName: functionName,
    Environment: { Variables: environment }
  }

  return lambda.updateFunctionConfiguration(params).promise().then(res => res.FunctionArn)
}

exports.createApiGateway = async function ({ definition, lambdaArn }) {
  const params = {
    body: JSON.stringify(definition),
    failOnWarnings: true
  }

  const result = await apiGateway.importRestApi(params).promise()

  await addPermission({ lambdaArn, restApiId: result.id })

  return result
}

exports.findApiGateway = async function (name) {
  const result = await apiGateway.getRestApis({ limit: 500 }).promise()

  if (result.items.length === 500) {
    throw new Error('Pagination not implemented yet')
  }

  const matches = result.items.filter(item => item.name === name)

  if (matches.length > 1) {
    throw new UserError(`Multiple API Gateways with the name "${name}" found, please use the --rest-api-id flag to specify which one to update.`)
  }

  if (matches.length < 1) {
    throw new UserError(`No API Gateway with the name "${name}" found, please use the --rest-api-id flag to specify which one to update.`)
  }

  return matches[0].id
}

exports.updateApiGateway = async function ({ id, definition, lambdaArn }) {
  const params = {
    body: JSON.stringify(definition),
    restApiId: id,
    failOnWarnings: true,
    mode: 'overwrite'
  }

  const result = await apiGateway.putRestApi(params).promise()

  await addPermission({ lambdaArn, restApiId: result.id })

  return result
}

exports.deployApiGateway = function ({ id, stage }) {
  const params = {
    restApiId: id,
    stageName: stage
  }

  return apiGateway.createDeployment(params).promise()
}

const assumeRolePolicy = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Principal: { Service: 'lambda.amazonaws.com' },
    Action: 'sts:AssumeRole'
  }]
})

exports.createLambdaRole = async function (name) {
  const createParams = {
    AssumeRolePolicyDocument: assumeRolePolicy,
    Path: '/',
    RoleName: name
  }

  const result = await iam.createRole(createParams).promise()

  const attachParams = {
    RoleName: name,
    PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
  }

  await iam.attachRolePolicy(attachParams).promise()

  // Give AWS some time to propagate the role
  await new Promise(resolve => setTimeout(resolve, 1500))

  return result.Role.Arn
}
