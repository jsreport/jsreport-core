/*!
 * Copyright(c) 2016 Jan Blaha
 *
 * Orchestration of the rendering process
 */

var q = require('q')
var path = require('path')
var _ = require('underscore')
var streamifier = require('streamifier')
var reportCounter = 0

function beforeRender (reporter, request) {
  if (!request.template) {
    return q.reject(new Error('template property must be defined.'))
  }

  request.reportCounter = ++reportCounter
  request.startTime = new Date()
  reporter.logger.info('Starting rendering request ' + reportCounter + ' (user: ' + (request.user ? request.user.username : 'null') + ')')

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

  return q.ninvoke(reporter.scriptManager, 'execute', {
    template: request.template,
    data: request.data,
    engine: request.template.pathToEngine,
    allowedModules: reporter.options.tasks.allowedModules || [],
    nativeModules: reporter.options.tasks.nativeModules || []
  }, {
    execModulePath: path.join(__dirname, 'engineScript.js')
  }).then(function (engineRes) {
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

    return recipes[0].execute(request, response)
  })
}

function afterRender (reporter, request, response) {
  return reporter.afterRenderListeners.fire(request, response).then(function () {
    reporter.logger.info('Rendering request ' + reportCounter + ' finished in ' + (new Date() - request.startTime) + ' ms')
    response.stream = streamifier.createReadStream(response.content)
    response.result = response.stream
    return response
  })
}

module.exports = function (reporter, request) {
  return beforeRender(reporter, request).then(function (response) {
    return invokeRender(reporter, request, response).then(function () {
      return afterRender(reporter, request, response).then(function () {
        return response
      })
    }).catch(function (e) {
      e.message = 'Error during rendering report: ' + e.message
      var logFn = e.weak ? reporter.logger.warn : reporter.logger.error
      logFn('Error when processing render request ' + e.message + ' ' + e.stack)
      throw e
    })
  })
}

