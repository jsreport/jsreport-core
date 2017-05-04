/*!
 * Copyright(c) 2016 Jan Blaha
 *
 * Child process script rendering html from template content, helpers and input data.
 * This script runs in the extra process because of multitenancy and security requirements, errors like infinite loop
 * should not affect other reports being rendered at the same time
 */

var vm = require('vm')
var path = require('path')
var os = require('os')
var resolveReferences = require('./resolveReferences.js')
var LRU = require('lru-cache')
var extend = require('node.extend')
var compiledCache

module.exports = function (inputs, callback, done) {
  inputs.tasks = inputs.tasks || {}
  inputs.template = extend({}, inputs.template)

  if (!compiledCache) {
    compiledCache = LRU(inputs.tasks.templateCache || { max: 100 })
  }

  if (inputs.tasks.templateCache && inputs.tasks.templateCache.enabled === false) {
    compiledCache.reset()
  }

  var messages = []
  var console = {}

  function addConsoleMethod (consoleMethod, level) {
    console[consoleMethod] = function () {
      messages.push({
        timestamp: new Date(),
        level: level,
        message: Array.prototype.join.call(arguments, ' ')
      })
    }
  }

  addConsoleMethod('log', 'debug')
  addConsoleMethod('warn', 'warn')
  addConsoleMethod('error', 'error')

  function doRequire (moduleName) {
    var searchedPaths = ''

    function safeRequire (require, path) {
      try {
        return require(path)
      } catch (e) {
        searchedPaths += path + os.EOL
        return false
      }
    }

    var result = (require.main ? safeRequire(require.main.require, moduleName, searchedPaths) : false) ||
      safeRequire(require, moduleName, searchedPaths) ||
      safeRequire(require, path.join(inputs.rootDirectory, moduleName), searchedPaths) ||
      safeRequire(require, path.join(inputs.appDirectory, moduleName), searchedPaths) ||
      safeRequire(require, path.join(inputs.parentModuleDirectory, moduleName), searchedPaths)

    if (!result) {
      throw new Error('Unable to find module ' + moduleName + os.EOL + 'Searched paths: ' + os.EOL + searchedPaths)
    }

    return result
  }

  var _require = function (moduleName) {
    var modules = inputs.tasks.modules.filter(function (m) {
      return m.alias === moduleName
    })

    if (modules.length > 0) {
      return require(modules[0].path)
    }

    if (inputs.tasks.allowedModules === '*') {
      return doRequire(moduleName)
    }

    var allowedModules = (inputs.tasks.allowedModules || []).filter(function (mod) {
      return mod === moduleName
    })

    if (allowedModules.length === 1) {
      return doRequire(moduleName)
    }

    throw new Error('Unsupported module in tasks: ' + moduleName + '. To enable require on particular module, you need to update the configuration as ' +
      '{"tasks": { "allowedModules": ["' + moduleName + '"] } } ... Alternatively you can also set "*" to allowedModules to enable everything')
  }

  inputs.data = resolveReferences(inputs.data) || {}
  inputs.data.__dataDirectory = inputs.dataDirectory
  inputs.data.__appDirectory = inputs.appDirectory
  inputs.data.__rootDirectory = inputs.rootDirectory
  inputs.data.__parentModuleDirectory = inputs.parentModuleDirectory

  var engine = require(inputs.engine)

  // the engine should return function since @1, however we test defensively here if the engine is already migrated
  // and polyfill it in case it was not
  var isOldFormat = true
  try {
    engine(' ', {}, {})
    isOldFormat = typeof engine(' ', {}, {}) !== 'function'
  } catch (e) {
  }

  if (isOldFormat) {
    var oldFormatEngine = engine
    engine = function (template) {
      return function (helpers, data) {
        return oldFormatEngine(template, helpers, data)
      }
    }
  }

  // wrapping with caching
  var originalEngine = engine
  var isFromCache = true
  engine = function (template) {
    var key = template + ':' + inputs.engine

    if (!compiledCache.get(key)) {
      isFromCache = false
      console.log('Compiled template not found in the cache, compiling')
      compiledCache.set(key, originalEngine(template))
    } else {
      console.log('Taking compiled template from engine cache')
    }

    return compiledCache.get(key)
  }

  var sandbox = {
    m: inputs,
    console: console,
    require: _require,
    render: engine,
    __dataDirectory: inputs.dataDirectory,
    __appDirectory: inputs.appDirectory,
    __rootDirectory: inputs.rootDirectory,
    __parentModuleDirectory: inputs.parentModuleDirectory,
    respond: function (err, content) {
      done(err, {
        content: content,
        isFromCache: isFromCache,
        logs: messages
      })
    }
  };

  (inputs.tasks.nativeModules || []).forEach(function (m) {
    sandbox[m.globalVariableName] = doRequire(m.module)
  })

  if (inputs.template.helpers) {
    // with in-process strategy helpers can be already a filled helpers object
    if (typeof inputs.template.helpers === 'string' || inputs.template.helpers instanceof String) {
      vm.runInNewContext(inputs.template.helpers, sandbox, { timeout: inputs.tasks.timeout })

      inputs.template.helpers = {}
      for (var fn in sandbox) {
        if (typeof sandbox[fn] === 'function') {
          inputs.template.helpers[fn] = sandbox[fn]
        }
      }
    }

    if (typeof inputs.template.helpers !== 'object') {
      return sandbox.respond(new Error('helpers must be string or plain object'))
    }
  } else {
    inputs.template.helpers = {}
  }

  try {
    vm.runInNewContext('respond(null, render(m.template.content)(m.template.helpers, m.data))', sandbox, { timeout: inputs.tasks.timeout })
  } catch (e) {
    var ex = e
    if (!e.message) {
      ex = new Error(e)
    }
    sandbox.respond(ex)
  }
}
