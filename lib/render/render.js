/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * Orchestration of the rendering process
 */

const path = require('path')
const streamifier = require('streamifier')
const Request = require('./request')
let reportCounter = 0

async function beforeRender (reporter, request, response) {
  if (!request.template) {
    throw new Error('template property must be defined.')
  }

  request.context.id = request.context.reportCounter = ++reportCounter
  request.context.startTimestamp = new Date().getTime()

  reporter.logger.info(`Starting rendering request ${reportCounter} (user: ${(request.context.user ? request.context.user.username : 'null')})`, request)

  await reporter.beforeRenderListeners.fire(request, response)
  await reporter.validateRenderListeners.fire(request, response)
}

async function invokeRender (reporter, request, response) {
  if (!request.template.engine) {
    throw new Error('Engine must be specified')
  }

  const engine = reporter.extensionsManager.engines.find((e) => e.name === request.template.engine)

  if (!engine) {
    throw new Error(`Engine '${request.template.engine}' not found. If this is a custom engine make sure it's properly installed from npm.`)
  }

  request.template.pathToEngine = engine.pathToEngine

  reporter.logger.debug(`Rendering engine ${request.template.engine}`, request)

  const pathToEngineScript = reporter.options.templatingEngines.engineScriptPath || path.join(__dirname, 'engineScript.js')

  const engineRes = await reporter.executeScript({
    template: request.template,
    data: request.data,
    engine: request.template.pathToEngine,
    safeSandboxPath: reporter.options.templatingEngines.safeSandboxPath,
    appDirectory: reporter.options.appDirectory,
    rootDirectory: reporter.options.rootDirectory,
    parentModuleDirectory: reporter.options.parentModuleDirectory,
    templatingEngines: reporter.options.templatingEngines
  }, {
    execModulePath: pathToEngineScript
  }, request)

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
    throw new Error(`Recipe '${request.template.recipe}' not found. If this is a custom recipe make sure it's properly installed from npm.`)
  }

  reporter.logger.debug('Executing recipe ' + request.template.recipe, request)

  return recipe.execute(request, response)
}

async function afterRender (reporter, request, response) {
  await reporter.afterRenderListeners.fire(request, response)
  reporter.logger.info(`Rendering request ${request.context.id} finished in ${(new Date().getTime() - request.context.startTimestamp)} ms`, request)
  response.stream = streamifier.createReadStream(response.content)
  response.result = response.stream
  return response
}

module.exports = async function (reporter, req, parentReq) {
  if (parentReq && !parentReq.__isJsreportRequest__) {
    throw new Error('Invalid parent request passed to render.')
  }

  const request = Request(req, parentReq)
  const response = { meta: {} }

  if (request.options.reportName) {
    response.meta.reportName = String(request.options.reportName)
  } else {
    response.meta.reportName = 'report'
  }

  try {
    if (reporter.entityTypeValidator.getSchema('TemplateType') != null) {
      const templateValidationResult = reporter.entityTypeValidator.validate('TemplateType', request.template, { rootPrefix: 'template' })

      if (!templateValidationResult.valid) {
        throw new Error(`template input in request contain values that does not match the defined schema. ${templateValidationResult.fullErrorMessage}`)
      }
    }

    await beforeRender(reporter, request, response)
    await invokeRender(reporter, request, response)
    await afterRender(reporter, request, response)
    response.meta.logs = request.context.logs

    if (parentReq) {
      parentReq.context.logs = parentReq.context.logs.concat(request.context.logs)
    }

    return response
  } catch (e) {
    await reporter.renderErrorListeners.fire(request, response, e)
    const logFn = e.weak ? reporter.logger.warn : reporter.logger.error
    logFn(`Error when processing render request ${e.message} ${e.stack}`, request)
    throw e
  }
}
