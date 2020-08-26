/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * Orchestration of the rendering process
 */

const path = require('path')
const extend = require('node.extend.without.arrays')
const streamifier = require('streamifier')
const Request = require('./request')
let reportCounter = 0

async function beforeRender (reporter, request, response) {
  if (!request.template) {
    throw reporter.createError('template property must be defined', {
      statusCode: 400
    })
  }

  request.context.id = request.context.reportCounter = ++reportCounter
  request.context.startTimestamp = new Date().getTime()

  reporter.logger.info(`Starting rendering request ${reportCounter} (user: ${(request.context.user ? request.context.user.username : 'null')})`, request)

  await reporter.beforeRenderListeners.fire(request, response)
  await reporter.validateRenderListeners.fire(request, response)
}

async function invokeRender (reporter, request, response) {
  if (!request.template.engine) {
    throw reporter.createError('Engine must be specified', {
      statusCode: 400
    })
  }

  const engine = reporter.extensionsManager.engines.find((e) => e.name === request.template.engine)

  if (!engine) {
    throw reporter.createError(`Engine '${request.template.engine}' not found. If this is a custom engine make sure it's properly installed from npm`, {
      statusCode: 400
    })
  }

  if (
    request.data != null &&
    typeof request.data === 'object' &&
    Array.isArray(request.data)
  ) {
    throw reporter.createError(`Request data can not be an array. you should pass an object in request.data input`, {
      statusCode: 400
    })
  }

  request.template.pathToEngine = engine.pathToEngine

  reporter.logger.debug(`Rendering engine ${request.template.engine} using ${reporter.options.templatingEngines.strategy} strategy`, request)

  const pathToEngineScript = reporter.options.templatingEngines.engineScriptPath || path.join(__dirname, 'engineScript.js')

  const engineRes = await reporter.executeScript({
    template: request.template,
    data: request.data,
    engine: request.template.pathToEngine,
    engineOptions: engine.engineOptions,
    safeSandboxPath: reporter.options.templatingEngines.safeSandboxPath,
    appDirectory: reporter.options.appDirectory,
    rootDirectory: reporter.options.rootDirectory,
    parentModuleDirectory: reporter.options.parentModuleDirectory,
    templatingEngines: reporter.options.templatingEngines
  }, {
    execModulePath: pathToEngineScript,
    timeout: reporter.options.templatingEngines.timeout,
    timeoutErrorMessage: 'Timeout during execution of templating engine'
  }, request)

  engineRes.logs.forEach(function (m) {
    reporter.logger[m.level](m.message, {...request, timestamp: m.timestamp})
  })

  response.content = Buffer.from(engineRes.content)
  await reporter.afterTemplatingEnginesExecutedListeners.fire(request, response)

  if (!request.template.recipe) {
    throw reporter.createError('Recipe must be specified', {
      statusCode: 400
    })
  }

  const recipe = reporter.extensionsManager.recipes.find((r) => r.name === request.template.recipe)

  if (!recipe) {
    throw reporter.createError(`Recipe '${request.template.recipe}' not found. If this is a custom recipe make sure it's properly installed from npm.`, {
      statusCode: 400
    })
  }

  reporter.logger.debug('Executing recipe ' + request.template.recipe, request)

  return recipe.execute(request, response)
}

async function afterRender (reporter, request, response) {
  await reporter.afterRenderListeners.fire(request, response)

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

  try {
    if (parentReq) {
      request.context.timeoutLimit = reporter.getAvailableRenderTimeout(parentReq)
    } else {
      let reportTimeout

      if (reporter.options.enableRequestReportTimeout && req.options && req.options.timeout != null) {
        reportTimeout = req.options.timeout
      } else {
        reportTimeout = reporter.options.reportTimeout
      }

      request.context.timeoutLimit = reportTimeout
    }

    if (request.options.reportName) {
      response.meta.reportName = String(request.options.reportName)
    } else {
      response.meta.reportName = 'report'
    }

    if (reporter.entityTypeValidator.getSchema('TemplateType') != null) {
      const templateValidationResult = reporter.entityTypeValidator.validate('TemplateType', request.template, { rootPrefix: 'template' })

      if (!templateValidationResult.valid) {
        throw reporter.createError(`template input in request contain values that does not match the defined schema. ${templateValidationResult.fullErrorMessage}`, {
          statusCode: 400
        })
      }
    }

    await beforeRender(reporter, request, response)
    await invokeRender(reporter, request, response)
    await afterRender(reporter, request, response)
    response.meta.logs = request.context.logs

    if (parentReq) {
      parentReq.context.logs = parentReq.context.logs.concat(request.context.logs)
      parentReq.context.shared = extend(true, parentReq.context.shared, request.context.shared)
    }

    return response
  } catch (e) {
    await reporter.renderErrorListeners.fire(request, response, e)
    const logFn = e.weak ? reporter.logger.warn : reporter.logger.error
    logFn(`Error when processing render request ${request.context.id} ${e.message}${e.stack != null ? ' ' + e.stack : ''}`, request)

    if (
      parentReq &&
      parentReq.context &&
      parentReq.context.logs &&
      request.context &&
      request.context.logs
    ) {
      parentReq.context.logs = parentReq.context.logs.concat(request.context.logs)
    }

    if (parentReq) {
      parentReq.context.shared = extend(true, parentReq.context.shared, request.context.shared)
    }

    e.logged = true
    throw e
  }
}
