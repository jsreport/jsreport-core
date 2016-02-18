/*!
 * Copyright(c) 2016 Jan Blaha
 *
 * Child process script rendering html from template content, helpers and input data.
 * This script runs in the extra process because of multitenancy and security requirements, errors like infinite loop
 * should not affect other reports being rendered at the same time
 */

// resolve references in json specified by $ref and $id attribute, this is handy when user send cycles in json
var resolveReferences = function (json) {
  if (typeof json === 'string') {
    json = JSON.parse(json)
  }

  var byid = {} // all objects by id
  var refs = [] // references to objects that could not be resolved
  json = (function recurse (obj, prop, parent) {
    if (typeof obj !== 'object' || !obj) { // a primitive value
      return obj
    }
    if (Object.prototype.toString.call(obj) === '[object Array]') {
      for (var i = 0; i < obj.length; i++) {
        if ('$ref' in obj[i]) {
          obj[i] = recurse(obj[i], i, obj)
        } else {
          obj[i] = recurse(obj[i], prop, obj)
        }
      }
      return obj
    }

    if ('$ref' in obj) { // a reference
      var ref = obj.$ref
      if (ref in byid) {
        return byid[ref]
      }
      // else we have to make it lazy:
      refs.push([parent, prop, ref])
      return
    } else if ('$id' in obj) {
      var id = obj.$id
      delete obj.$id
      if ('$values' in obj) { // an array
        obj = obj.$values.map(recurse)
      } else { // a plain object
        for (var p in obj) {
          if (obj.hasOwnProperty(p)) {
            obj[p] = recurse(obj[p], p, obj)
          }
        }
      }
      byid[id] = obj
    }
    return obj
  })(json) // run it!

  for (var i = 0; i < refs.length; i++) { // resolve previously unknown references
    var ref = refs[i]
    ref[0][ref[1]] = byid[ref[2]]
    // Notice that this throws if you put in a reference at top-level
  }
  return json
}

var vm = require('vm')
var path = require('path')
var os = require('os')

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
    if ((typeof inputs.template.helpers === 'string' || inputs.template.helpers instanceof String)) {
      // first grab helpers as it would be an object { "foo" : function... } for back compatibility reasons
      // when its not an object eval again and let helpers register into globals
      vm.runInNewContext('jsrHelpers = ' + inputs.template.helpers, sandbox)

      if (sandbox.jsrHelpers && typeof sandbox.jsrHelpers === 'object') {
        inputs.template.helpers = sandbox.jsrHelpers
      } else {
        vm.runInNewContext(inputs.template.helpers, sandbox)

        inputs.template.helpers = {}
        for (var fn in sandbox) {
          if (typeof sandbox[fn] === 'function') {
            inputs.template.helpers[fn] = sandbox[fn]
          }
        }
      }
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
