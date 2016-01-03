var util = require('util')
var winston = require('winston')
var debug = require('debug')('jsreport')

var DebugTransport = module.exports = function (options) {
  options = options || {}
  this.name = 'debug'
  this.level = options.level || 'info'
}

util.inherits(DebugTransport, winston.Transport)

DebugTransport.prototype.log = function (level, msg, meta, callback) {
  debug(level + ' ' + msg)
  callback(null, true)
}
