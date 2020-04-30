const createLogger = require('./createScriptLogger')

module.exports = async function scriptCallbackModuleWrapper (reporter, req, callbackModulePath, inputs, cb) {
  try {
    debugger
    const inputsToUse = Object.assign({}, inputs)

    // we handle logs here in callback in order to mantain correct order of logs
    // between render callback calls
    inputsToUse.logs.forEach(m => {
      reporter.logger[m.level](m.message, { ...req, timestamp: m.timestamp })
    })

    delete inputsToUse.logs

    const callbackModule = require(callbackModulePath)

    debugger

    const { logger, getLogs } = createLogger()

    inputsToUse.logger = logger

    const result = await callbackModule(reporter, req, inputsToUse)

    debugger

    getLogs().forEach(m => {
      reporter.logger[m.level](m.message, { ...req, timestamp: m.timestamp })
    })

    cb(null, result)
  } catch (e) {
    cb(e)
  }
}
