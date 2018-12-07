/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * Child process script rendering html from template content, helpers and input data.
 * This script runs in the extra process because of multitenancy and security requirements, errors like infinite loop
 * should not affect other reports being rendered at the same time
 */

const resolveReferences = require('./resolveReferences.js')
const LRU = require('lru-cache')
const extend = require('node.extend.without.arrays')
let compiledCache

module.exports = function (inputs, callback, done) {
  const safeSandbox = require(inputs.safeSandboxPath)
  const requireWithPaths = safeSandbox.requireWithPaths

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

  const engine = (template) => {
    const key = template + ':' + inputs.engine

    if (!compiledCache.get(key)) {
      isFromCache = false
      consoleFromSandbox.log('Compiled template not found in the cache, compiling')
      compiledCache.set(key, originalEngine(template))
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
    let err

    if (rawErr != null) {
      const isErrorObj = (
        typeof rawErr === 'object' &&
        typeof rawErr.hasOwnProperty === 'function' &&
        rawErr.hasOwnProperty('message')
      )

      const isValidError = (
        isErrorObj ||
        typeof rawErr === 'string'
      )

      if (!isValidError) {
        if (Object.prototype.toString.call(rawErr) === '[object Object]') {
          err = new Error(`Template execution threw with non-Error: ${JSON.stringify(rawErr)}`)
        } else {
          err = new Error(`Template execution threw with non-Error: ${rawErr}`)
        }
      } else {
        if (typeof rawErr === 'string') {
          err = new Error(rawErr)
        } else {
          err = new Error(rawErr.message)

          if (rawErr.stack) {
            err.stack = rawErr.stack
          }
        }
      }
    }

    done(err, {
      content: content,
      isFromCache: isFromCache,
      logs: consoleMessages
    })
  }

  const initialSandbox = {
    m: inputs,
    render: engine,
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
      timeout: inputs.templatingEngines.timeout,
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

    sandboxContext.m.template.helpers = contextifyValue(templateHelpers)

    inputs.template.helpers = templateHelpers

    run('respond(null, render(m.template.content)(m.template.helpers, m.data))', {
      filename: 'evaluate-template-engine.js',
      mainFilename: 'evaluate-template-engine-helpers.js',
      mainSource: originalTemplateHelpersStr
    })
  } catch (e) {
    respondWrap(e)
  }
}
