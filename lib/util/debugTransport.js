const Transport = require('winston-transport')
const debug = require('debug')('jsreport')

module.exports = class DebugTransport extends Transport {
  constructor (options = {}) {
    super(options)
    this.name = 'debug'
    this.level = options.level || 'debug'
  }

  log (level, msg, meta, callback) {
    debug(level + ' ' + msg)
    callback(null, true)
  }
}
