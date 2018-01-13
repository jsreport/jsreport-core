/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * Orchestration of the rendering process
 */

const Promise = require('bluebird')
const path = require('path')
const streamifier = require('streamifier')
const winston = require('winston')
const DummyTransport = require('../util/dummyTransport')
let reportCounter = 0

async function beforeRender (reporter, request) {
  if (!request.template) {
    return Promise.reject(new Error('template property must be defined.'))
  }

  request.id = request.reportCounter = ++reportCounter
  request.startTime = new Date()
  request.logger.info('Starting rendering request ' + reportCounter + ' (user: ' + (request.user ? request.user.username : 'null') + ')')

  request.options = request.options || {}
  request.reporter = reporter

  if (typeof request.data === 'string') {
    try {
      request.data = JSON.parse(request.data.toString())
    } catch (e) {
    }
  }

  const response = {headers: {}}

  await reporter.beforeRenderListeners.fire(request, response)
  await reporter.validateRenderListeners.fire(request, response)

  return response
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

  request.logger.debug('Rendering engine ' + request.template.engine)

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
    request.logger[m.level](m.message, {timestamp: new Date(m.timestamp)})
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

  request.logger.debug('Executing recipe ' + request.template.recipe)

  return recipe.execute(request, response)
}

async function afterRender (reporter, request, response) {
  await reporter.afterRenderListeners.fire(request, response)
  request.logger.info('Rendering request ' + request.id + ' finished in ' + (new Date() - request.startTime) + ' ms')
  response.stream = streamifier.createReadStream(response.content)
  response.result = response.stream
  return response
}

module.exports = async function (reporter, request) {
  const logger = new (winston.Logger)({
    transports: [new DummyTransport()],
    level: 'debug',
    rewriters: [
      function (level, msg, meta) {
        meta.requestId = request.id
        reporter.logger.log(level, msg, meta)
        return meta
      }]
  })

  request.logger = logger
  let response
  try {
    response = await beforeRender(reporter, request)
    await invokeRender(reporter, request, response)
    await afterRender(reporter, request, response)
    return response
  } catch (e) {
    await reporter.renderErrorListeners.fire(request, response, e)
    e.message = 'Error during rendering report: ' + e.message
    const logFn = e.weak ? request.logger.warn : request.logger.error
    logFn('Error when processing render request ' + e.message + ' ' + e.stack)
    throw e
  }
}
