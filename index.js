var Reporter = require('./lib/reporter.js')
var path = require('path')

module.exports = function (options) {
  options = options || {}

  options.parentModuleDirectory = options.parentModuleDirectory || path.dirname(module.parent.filename)

  return new Reporter(options)
}

module.exports.Reporter = Reporter
