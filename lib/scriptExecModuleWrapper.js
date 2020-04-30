const util = require('util')
const createLogger = require('./createScriptLogger')

module.exports = async function scriptExecModuleWrapper (inputs, callback, done) {
  try {
    const inputsToUse = Object.assign({}, inputs)
    const execModulePath = inputsToUse.execModulePath
    const callbackAsync = callback ? util.promisify(callback) : undefined

    delete inputsToUse.execModulePath

    const execModule = require(execModulePath)

    const { logger, getLogs, clearLogs } = createLogger()

    inputsToUse.logger = logger

    const runCallback = callbackAsync != null ? async (callbackInputs) => {
      const pendingLogs = getLogs()
      clearLogs()

      const callbackResult = await callbackAsync(Object.assign({}, callbackInputs, {
        logs: pendingLogs
      }))

      return callbackResult
    } : undefined

    const result = await execModule(inputsToUse, runCallback)

    result.logs = getLogs()

    done(null, result)
  } catch (e) {
    done(e)
  }
}
