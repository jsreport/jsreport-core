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
        const callback = require(path.join(__dirname, '../scriptCallbackModuleWrapper.js')).bind(undefined, reporter, req, optionsToUse.callbackModulePath)
        delete optionsToUse.callbackModulePath
        optionsToUse.callback = callback
      }
    }

    const result = await reporter.scriptManager.executeAsync(inputsToUse, optionsToUse)

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
