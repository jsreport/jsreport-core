const path = require('path')

module.exports = async function executeScript (reporter, inputs, options, req) {
  try {
    const inputsToUse = Object.assign({}, inputs)
    const optionsToUse = Object.assign({}, options)

    optionsToUse.timeout = reporter.getAvailableRenderTimeout(req, options != null ? options.timeout : undefined)
    inputsToUse.timeout = optionsToUse.timeout

    const useNewApiContract = optionsToUse.hasOwnProperty('callbackModulePath')

    if (useNewApiContract) {
      inputsToUse.execModulePath = optionsToUse.execModulePath
      optionsToUse.execModulePath = path.join(__dirname, '../scriptExecModuleWrapper.js')

      delete optionsToUse.callback

      if (optionsToUse.callbackModulePath != null) {
        let pathToCallbackModule
        let callbackModuleWrapper

        if (typeof optionsToUse.callbackModulePath === 'string') {
          pathToCallbackModule = optionsToUse.callbackModulePath
        } else {
          pathToCallbackModule = optionsToUse.callbackModulePath.path
          callbackModuleWrapper = optionsToUse.callbackModulePath.wrapper
        }

        let callback = require(path.join(__dirname, '../scriptCallbackModuleWrapper.js')).bind(undefined, reporter, req, pathToCallbackModule)

        if (typeof callbackModuleWrapper === 'function') {
          callback = callbackModuleWrapper(callback)
        }

        delete optionsToUse.callbackModulePath
        optionsToUse.callback = callback
      }
    }

    const result = await reporter.scriptManager.executeAsync(inputsToUse, optionsToUse)
    if (result.$sharedContext) {
      req.context.shared = result.$sharedContext
    }

    if (useNewApiContract) {
      result.logs.forEach(m => {
        reporter.logger[m.level](m.message, { ...req, timestamp: m.timestamp })
      })

      delete result.logs
    }

    return result
  } catch (e) {
    throw reporter.createError(undefined, {
      weak: true,
      original: e
    })
  }
}
