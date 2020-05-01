const util = require('util')

module.exports = function createLogger () {
  let logs = []

  const logFn = (level, ...args) => {
    const lastArg = args.slice(-1)[0]
    let msgArgs = args
    let timestamp

    if (lastArg != null && typeof lastArg === 'object') {
      msgArgs = args.slice(0, -1)

      if (lastArg.timestamp != null) {
        timestamp = lastArg.timestamp
      }
    }

    logs.push({
      timestamp: timestamp != null ? timestamp : new Date().getTime(),
      level: level,
      message: util.format.apply(util, msgArgs)
    })
  }

  const logger = {
    debug: (...args) => logFn('debug', ...args),
    info: (...args) => logFn('info', ...args),
    warn: (...args) => logFn('warn', ...args),
    error: (...args) => logFn('error', ...args)
  }

  const clear = () => {
    logs = []
  }

  return { logger, getLogs: () => logs, clearLogs: clear }
}
