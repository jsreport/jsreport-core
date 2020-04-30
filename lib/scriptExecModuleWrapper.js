const util = require('util')
const createLogger = require('./createScriptLogger')

module.exports = async function scriptExecModuleWrapper (inputs, callback, done) {
  try {
    debugger
    const inputsToUse = Object.assign({}, inputs)
    const execModulePath = inputsToUse.execModulePath
    const callbackAsync = callback ? util.promisify(callback) : undefined

    delete inputsToUse.execModulePath

    debugger
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

    const runExecModule = async (...args) => {
      // NOTE: just for now for back-compatibility
      if (execModule.length === 3) {
        return new Promise((resolve, reject) => {
          execModule(...args, (err, result) => {
            if (err) {
              return reject(err)
            }

            resolve(result)
          })
        })
      } else {
        return execModule(...args)
      }
    }

    debugger
    const result = await runExecModule(inputsToUse, runCallback)

    debugger
    // NOTE: just for now for back-compatibility
    if (!result.logs) {
      result.logs = getLogs()
    }

    done(null, result)
  } catch (e) {
    done(e)
  }
}
