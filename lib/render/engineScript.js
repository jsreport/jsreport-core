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

module.exports = function (inputs, callback, done) {

  var messages = [];
  function extendFunction (consoleMethod, level) {
    var original = console[consoleMethod]

    console[consoleMethod] = function () {
      original.apply(this, arguments)
      messages.push({
        timestamp: new Date(),
        level: level,
        message: Array.prototype.join.call(arguments, ' ')
      })
    }
  }

  extendFunction('log', 'debug')
  extendFunction('warn', 'warn')
  extendFunction('error', 'error')

  function doRequire(moduleName) {
    var searchedPaths = ''

    function safeRequire(require, path) {
      try {
        return require(path)
      } catch (e) {
        searchedPaths += path + os.EOL
        return false
      }
    }

    var result = safeRequire(require.main.require, moduleName, searchedPaths) ||
      safeRequire(require, moduleName, searchedPaths) ||
      safeRequire(require, path.join(inputs.rootDirectory, moduleName), searchedPaths) ||
      safeRequire(require, path.join(inputs.appDirectory, moduleName), searchedPaths) ||
      safeRequire(require, path.join(inputs.parentModuleDirectory, moduleName), searchedPaths)

    if (!result) {
      throw new Error('Unable to find module ' + moduleName + os.EOL + 'Searched paths: ' + os.EOL + searchedPaths)
    }

    return result;
  }



  var _require = function (moduleName) {
    if (inputs.allowedModules === '*') {
      return doRequire(moduleName)
    }

    var modules = inputs.allowedModules.filter(function (mod) {
      return mod === moduleName
    })

    if (modules.length === 1) {
      return doRequire(moduleName)
    }

    throw new Error('Unsupported module ' + moduleName)
  }

  var gc = global.gc

  inputs.data = resolveReferences(inputs.data)

  var sandbox = {
    m: inputs,
    console: console,
    require: _require,
    render: require(inputs.engine),
    __appDirectory: inputs.appDirectory,
    __rootDirectory: inputs.rootDirectory,
    __parentModuleDirectory: inputs.parentModuleDirectory,
    respond: function (err, content) {
      setTimeout(function () {
        delete sandbox
        if (gc) {
          gc()
        }
      }, 1000)
      done(err, {
        content: content,
        logs: messages
      })
    }
  }

  inputs.nativeModules.forEach(function (m) {
    sandbox[m.globalVariableName] = doRequire(m.module)
  })

  if (inputs.template.helpers ) {

    //with in-process strategy helpers can be already a filled helpers object
    if (typeof inputs.template.helpers === 'string' || inputs.template.helpers instanceof String) {
      vm.runInNewContext(inputs.template.helpers, sandbox)

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
    vm.runInNewContext('respond(null, render(m.template.content, m.template.helpers, m.data))', sandbox)
  } catch (e) {
    var ex = e
    if (!e.message) {
      ex = new Error(e)
    }
    sandbox.respond(ex)
  }
}
