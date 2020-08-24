const createLogger = require('./createScriptLogger')

module.exports = async function scriptCallbackModuleWrapper (reporter, req, callbackModulePath, inputs, cb) {
  try {
    const inputsToUse = Object.assign({}, inputs)

    // we handle logs here in callback in order to mantain correct order of logs
    // between render callback calls
    inputsToUse.logs.forEach(m => {
      reporter.logger[m.level](m.message, { ...req, timestamp: m.timestamp })
    })

    delete inputsToUse.logs

    const callbackModule = require(callbackModulePath)

    const { logger, getLogs } = createLogger()

    inputsToUse.logger = logger

    if (inputs.$sharedContext) {
      req.context.shared = inputs.$sharedContext
    }
    const result = await callbackModule(reporter, req, inputsToUse)

    getLogs().forEach(m => {
      reporter.logger[m.level](m.message, { ...req, timestamp: m.timestamp })
    })

    if (inputs.$sharedContext) {
      result.$sharedContext = req.context.shared
    }

    cb(null, result)
  } catch (e) {
    cb(e)
  }
}
