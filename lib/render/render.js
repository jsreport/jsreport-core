/*!
 * Copyright(c) 2016 Jan Blaha
 *
 * Orchestration of the rendering process
 */

var Promise = require('bluebird')
var path = require('path')
var _ = require('underscore')
var streamifier = require('streamifier')
var reportCounter = 0
var winston = require('winston')
var util = require('util')

var DummyTransport = function (options) {
}
util.inherits(DummyTransport, winston.Transport)

DummyTransport.prototype.log = function (level, msg, meta, callback) {
  callback(null, true)
}

function beforeRender (reporter, request) {
  if (!request.template) {
    return Promise.reject(new Error('template property must be defined.'))
  }

  request.id = request.reportCounter = ++reportCounter
  request.startTime = new Date()
  request.logger.info('Starting rendering request ' + reportCounter + ' (user: ' + (request.user ? request.user.username : 'null') + ')')

  request.options = request.options || {}
  request.reporter = reporter

  if (_.isString(request.data)) {
    try {
      request.data = JSON.parse(request.data.toString())
    } catch (e) {
    }
  }

  // just for back compatibility until all recipes are updated to forget toner
  reporter.options.tasks.tempDirectory = reporter.options.tempDirectory
  request.toner = {
    options: reporter.options.tasks,
    render: function (req, cb) {
      reporter.render(req).then(function (res) {
        cb(null, res)
      }).catch(function (err) {
        cb(err)
      })
    }
  }

  var response = {headers: {}}

  return reporter.beforeRenderListeners.fire(request, response).then(function () {
    return reporter.validateRenderListeners.fire(request, response)
  }).then(function () {
    return response
  })
}

function invokeRender (reporter, request, response) {
  if (!request.template.engine) {
    throw new Error('Engine must be specified')
  }

  var engines = reporter.extensionsManager.engines.filter(function (e) {
    return e.name === request.template.engine
  })

  if (!engines.length) {
    throw new Error("Engine '" + request.template.engine + "' not found")
  }
  var engine = engines[0]

  request.template.pathToEngine = engine.pathToEngine

  request.logger.debug('Rendering engine ' + request.template.engine)

  var pathToEngineScript = reporter.options.tasks.engineScriptPath || path.join(__dirname, 'engineScript.js')

  return Promise.promisify(reporter.scriptManager.execute).bind(reporter.scriptManager)({
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
  }).then(function (engineRes) {
    engineRes.logs.forEach(function (m) {
      request.logger[m.level](m.message, {timestamp: new Date(m.timestamp)})
    })

    response.content = new Buffer(engineRes.content)
    return reporter.afterTemplatingEnginesExecutedListeners.fire(request, response)
  }).then(function () {
    if (!request.template.recipe) {
      throw new Error('Recipe must be specified')
    }

    var recipes = reporter.extensionsManager.recipes.filter(function (r) {
      return r.name === request.template.recipe
    })

    if (!recipes.length) {
      throw new Error("Recipe '" + request.template.recipe + "' not found")
    }

    request.logger.debug('Executing recipe ' + request.template.recipe)

    return recipes[0].execute(request, response)
  })
}

function afterRender (reporter, request, response) {
  return reporter.afterRenderListeners.fire(request, response).then(function () {
    request.logger.info('Rendering request ' + request.id + ' finished in ' + (new Date() - request.startTime) + ' ms')
    response.stream = streamifier.createReadStream(response.content)
    response.result = response.stream
    return response
  })
}

module.exports = function (reporter, request) {
  var logger = new (winston.Logger)({
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
  var response

  return beforeRender(reporter, request).then(function (aresponse) {
    response = aresponse
    return invokeRender(reporter, request, response).then(function () {
      return afterRender(reporter, request, response).then(function () {
        return response
      })
    })
  }).catch(function (e) {
    return reporter.renderErrorListeners.fire(request, response, e).then(function () {
      e.message = 'Error during rendering report: ' + e.message
      var logFn = e.weak ? request.logger.warn : request.logger.error
      logFn('Error when processing render request ' + e.message + ' ' + e.stack)
      throw e
    })
  })
}

