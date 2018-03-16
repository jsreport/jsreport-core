/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * Orchestration of the rendering process
 */

const Promise = require('bluebird')
const path = require('path')
const streamifier = require('streamifier')
const Request = require('./request')
let reportCounter = 0

async function beforeRender (reporter, request, response) {
  if (!request.template) {
    return Promise.reject(new Error('template property must be defined.'))
  }

  request.context.id = request.context.reportCounter = ++reportCounter
  request.context.startTime = new Date()
  reporter.logger.info('Starting rendering request ' + reportCounter + ' (user: ' + (request.context.user ? request.context.user.username : 'null') + ')', request)

  await reporter.beforeRenderListeners.fire(request, response)
  await reporter.validateRenderListeners.fire(request, response)
}

async function invokeRender (reporter, request, response) {
  if (!request.template.engine) {
    throw new Error('Engine must be specified')
  }

  const engine = reporter.extensionsManager.engines.find((e) => e.name === request.template.engine)

  if (!engine) {
    throw new Error("Engine '" + request.template.engine + "' not found")
  }

  request.template.pathToEngine = engine.pathToEngine

  reporter.logger.debug('Rendering engine ' + request.template.engine, request)

  const pathToEngineScript = reporter.options.tasks.engineScriptPath || path.join(__dirname, 'engineScript.js')

  const engineRes = await Promise.promisify(reporter.scriptManager.execute).bind(reporter.scriptManager)({
    template: request.template,
    data: request.data,
    engine: request.template.pathToEngine,
    appDirectory: reporter.options.appDirectory,
    dataDirectory: path.resolve(reporter.options.dataDirectory),
    rootDirectory: reporter.options.rootDirectory,
    parentModuleDirectory: reporter.options.parentModuleDirectory,
    tasks: reporter.options.tasks
  }, {
    execModulePath: pathToEngineScript
  })

  engineRes.logs.forEach(function (m) {
    reporter.logger[m.level](m.message, {...request, timestamp: m.timestamp})
  })

  response.content = Buffer.from(engineRes.content)
  await reporter.afterTemplatingEnginesExecutedListeners.fire(request, response)

  if (!request.template.recipe) {
    throw new Error('Recipe must be specified')
  }

  const recipe = reporter.extensionsManager.recipes.find((r) => r.name === request.template.recipe)

  if (!recipe) {
    throw new Error("Recipe '" + request.template.recipe + "' not found")
  }

  reporter.logger.debug('Executing recipe ' + request.template.recipe, request)

  return recipe.execute(request, response)
}

async function afterRender (reporter, request, response) {
  await reporter.afterRenderListeners.fire(request, response)
  reporter.logger.info('Rendering request ' + request.context.id + ' finished in ' + (new Date() - request.context.startTime) + ' ms', request)
  response.stream = streamifier.createReadStream(response.content)
  response.result = response.stream
  return response
}

module.exports = async function (reporter, req) {
  const request = Request(req)
  const response = {meta: { reportName: 'report' }}

  try {
    await beforeRender(reporter, request, response)
    await invokeRender(reporter, request, response)
    await afterRender(reporter, request, response)
    response.meta.logs = request.context.logs
    return response
  } catch (e) {
    await reporter.renderErrorListeners.fire(request, response, e)
    e.message = 'Error during rendering report: ' + e.message
    const logFn = e.weak ? reporter.logger.warn : reporter.logger.error
    logFn('Error when processing render request ' + e.message + ' ' + e.stack, request)
    throw e
  }
}
