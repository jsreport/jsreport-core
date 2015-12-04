var Reporter = require('./lib/reporter.js')

module.exports = function (options) {
  return new Reporter(options)
}

module.exports.Reporter = Reporter
