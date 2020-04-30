/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * Child process script rendering html from template content, helpers and input data.
 * This script runs in the extra process because of multitenancy and security requirements, errors like infinite loop
 * should not affect other reports being rendered at the same time
 */

const util = require('util')
const resolveReferences = require('./resolveReferences.js')
const LRU = require('lru-cache')
const extend = require('node.extend.without.arrays')
const nanoid = require('nanoid')
const asyncReplace = util.promisify(require('async-replace'))
let compiledCache

module.exports = function (inputs, callback, done) {
  const sandboxTimeout = inputs.timeout
  const safeSandbox = require(inputs.safeSandboxPath)
  const requireWithPaths = safeSandbox.requireWithPaths
  const asyncResultMap = new Map()
  let errorInAsyncHelpers = false

  inputs.templatingEngines = inputs.templatingEngines || {}
  inputs.template = extend({}, inputs.template)

  if (!compiledCache) {
    compiledCache = LRU(inputs.templatingEngines.templateCache || { max: 100 })
  }

  if (inputs.templatingEngines.templateCache && inputs.templatingEngines.templateCache.enabled === false) {
    compiledCache.reset()
  }

  inputs.data = resolveReferences(inputs.data) || {}
  inputs.data.__appDirectory = inputs.appDirectory
  inputs.data.__rootDirectory = inputs.rootDirectory
  inputs.data.__parentModuleDirectory = inputs.parentModuleDirectory

  // wrapping with caching
  const originalEngine = require(inputs.engine)

  let isFromCache = true

  const engine = (template, opts) => {
    const key = template + ':' + inputs.engine

    if (!compiledCache.get(key)) {
      isFromCache = false
      consoleFromSandbox.log('Compiled template not found in the cache, compiling')
      compiledCache.set(key, originalEngine(template, opts))
    } else {
      consoleFromSandbox.log('Taking compiled template from engine cache')
    }

    return compiledCache.get(key)
  }

  const requirePaths = [
    inputs.rootDirectory,
    inputs.appDirectory,
    inputs.parentModuleDirectory
  ]

  function respondWrap (rawErr, content) {
    if (errorInAsyncHelpers) {
      return
    }

    const handleError = (errValue) => {
      let newError

      const isErrorObj = (
        typeof errValue === 'object' &&
        typeof errValue.hasOwnProperty === 'function' &&
        errValue.hasOwnProperty('message')
      )

      const isValidError = (
        isErrorObj ||
        typeof errValue === 'string'
      )

      if (!isValidError) {
        if (Object.prototype.toString.call(errValue) === '[object Object]') {
          newError = new Error(`Template execution threw with non-Error: ${JSON.stringify(errValue)}`)
        } else {
          newError = new Error(`Template execution threw with non-Error: ${errValue}`)
        }
      } else {
        if (typeof errValue === 'string') {
          newError = new Error(errValue)
        } else {
          newError = new Error(errValue.message)

          if (errValue.stack) {
            newError.stack = errValue.stack
          }
        }
      }

      return newError
    }

    if (rawErr != null) {
      return done(handleError(rawErr))
    }

    let promises

    if (asyncResultMap.size > 0) {
      promises = asyncResultMap.values()
    } else {
      promises = []
    }

    Promise.all(promises).then((asyncValues) => {
      if (errorInAsyncHelpers) {
        return
      }

      if (asyncValues.length === 0) {
        return content
      }

      return asyncReplace(content, /{#asyncHelperResult ([^{}]+)}/g, (str, p1, offset, s, replaceDone) => {
        const asyncResultId = p1
        const asyncResult = asyncResultMap.get(asyncResultId)

        if (asyncResult == null) {
          return replaceDone(null, '')
        }

        return replaceDone(null, `${asyncResult}`)
      })
    }).then((finalContent) => {
      if (errorInAsyncHelpers) {
        return
      }

      done(null, {
        content: finalContent,
        isFromCache: isFromCache,
        logs: consoleMessages
      })
    }).catch((asyncErr) => {
      done(handleError(asyncErr))
    })
  }

  const initialSandbox = {
    m: inputs,
    render: engine,
    setTimeout: setTimeout,
    __appDirectory: inputs.appDirectory,
    __rootDirectory: inputs.rootDirectory,
    __parentModuleDirectory: inputs.parentModuleDirectory,
    respond: respondWrap
  }

  const nativeModulesLoadedMap = new Map()

  ;(inputs.templatingEngines.nativeModules || []).forEach((m) => {
    initialSandbox[m.globalVariableName] = requireWithPaths(m.module, requirePaths)
    nativeModulesLoadedMap.set(m.globalVariableName, initialSandbox[m.globalVariableName])
  })

  const {
    sandbox: sandboxContext,
    contextifyValue,
    console: consoleSandbox,
    messages,
    run
  } = safeSandbox(
    initialSandbox,
    {
      errorPrefix: 'Error while executing templating engine.',
      timeout: sandboxTimeout,
      formatError: (error, moduleName) => {
        error.message += ` To be able to require custom modules you need to add to configuration { "allowLocalFilesAccess": true } or enable just specific module using { templatingEngines: { allowedModules": ["${moduleName}"] }`
      },
      allowedModules: inputs.templatingEngines.allowedModules,
      requirePaths,
      requireMap: (moduleName) => {
        const m = inputs.templatingEngines.modules.find((m) => m.alias === moduleName)

        if (m) {
          return require(m.path)
        }

        if (nativeModulesLoadedMap.has(moduleName)) {
          return nativeModulesLoadedMap.get(moduleName)
        }
      }
    }
  )

  const consoleMessages = messages
  const consoleFromSandbox = consoleSandbox

  let templateHelpers = inputs.template.helpers
  let originalTemplateHelpersStr

  function wrapHelperForAsyncSupport (fn) {
    return function (...args) {
      // important to call the helper with the current this to preserve the same behaviour
      const fnResult = fn.call(this, ...args)

      if (!isPromise(fnResult)) {
        return fnResult
      }

      const asyncResultId = nanoid(7)

      fnResult.then((value) => {
        asyncResultMap.set(asyncResultId, value)
      }).catch((asyncErr) => {
        if (errorInAsyncHelpers) {
          return
        }

        errorInAsyncHelpers = true
        respondWrap(asyncErr)
      })

      asyncResultMap.set(asyncResultId, fnResult)

      return `{#asyncHelperResult ${asyncResultId}}`
    }
  }

  try {
    if (templateHelpers) {
      // with in-process strategy helpers can be already a filled helpers object
      if (typeof templateHelpers === 'string' || templateHelpers instanceof String) {
        run(templateHelpers, {
          filename: 'evaluate-template-engine-helpers.js',
          mainFilename: 'evaluate-template-engine-helpers.js',
          mainSource: templateHelpers
        })

        originalTemplateHelpersStr = templateHelpers

        templateHelpers = {}

        for (const fn in sandboxContext) {
          if (typeof sandboxContext[fn] === 'function') {
            templateHelpers[fn] = sandboxContext[fn]
          }
        }
      }

      if (typeof templateHelpers !== 'object') {
        return respondWrap(new Error('helpers must be string or plain object'))
      }
    } else {
      templateHelpers = {}
    }

    Object.keys(templateHelpers).forEach((prop) => {
      templateHelpers[prop] = wrapHelperForAsyncSupport(templateHelpers[prop])
    })

    sandboxContext.m.template.helpers = contextifyValue(templateHelpers)

    inputs.template.helpers = templateHelpers

    run('respond(null, render(m.template.content, m.engineOptions || {})(m.template.helpers, m.data))', {
      filename: 'evaluate-template-engine.js',
      mainFilename: 'evaluate-template-engine-helpers.js',
      mainSource: originalTemplateHelpersStr
    })
  } catch (e) {
    respondWrap(e)
  }
}

function isPromise (value) {
  return (
    // is object
    (value !== null && (typeof value === 'object' || typeof value === 'function')) &&
    typeof value.then === 'function' &&
    typeof value.catch === 'function'
  )
}
