# Scandium

> Easily deploy any Node.js web server to AWS Lambda.

Scandium can deploy your Express, Koa or similar app to lambda, without any modifications to your code. Combined with AWS API Gateway you can have your current API running serverless in no time 😎

## Installation

```sh
npm install --global scandium
```

## Usage

To create a new Lambda function, use the `scandium create` command. This will package your application and upload it to AWS Lambda, as well as configure an API Gateway in front of your function.

```sh
scandium create --name=my-awesome-api
```

You should now be presented with a url where you can access your api.

> Now serving live requests at: https://xxxxxxxxxx.execute-api.us-west-2.amazonaws.com/default

Whenever you make changes to your app, you can upload a new version of it by using the `scandium update` command. This will package your application again, and upload it as a new version to the specified Lambda function. It will also update the configuration of the API Gateway to point at the new function.

```sh
scandium update --name=my-awesome-api
```

## Tutorials

- [Deploying a Next.js app to AWS Lambda](https://medium.com/@LinusU/deploying-a-next-js-app-to-aws-lambda-4dcdd233f876)

## API Gateway

By default, Scandium will set up an API Gateway that simply forwards all requests to the Lambda function. If you want to utilise the benefits of API Gateway fully, you can provide a Swagger file describing your API endpoints. Pass the `--swagger=my-api-definition.yml` to either the `create` or `update` command and Scandium will configure the API Gateway for you.

## `prepare`-scripts

Scandium has support for `prepare` scripts, if the script is present in the `package.json` it will make sure that the script is being run with full `devDependencies` installed. The final package being uploaded to Lambda will still only contain the production `dependencies`.
