const util = require('util')

module.exports = function createLogger () {
  let logs = []

  const logFn = (level, ...args) => {
    logs.push({
      timestamp: new Date().getTime(),
      level: level,
      message: util.format.apply(util, args)
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
