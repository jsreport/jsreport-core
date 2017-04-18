var util = require('util')
var winston = require('winston')
var debug = require('debug')('jsreport')

var DebugTransport = module.exports = function (options) {
  options = options || {}
  this.name = 'debug'
  this.level = options.level || 'debug'
}

util.inherits(DebugTransport, winston.Transport)

DebugTransport.prototype.name = 'debug'

DebugTransport.prototype.log = function (level, msg, meta, callback) {
  debug(level + ' ' + msg)
  callback(null, true)
}
