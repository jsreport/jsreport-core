var bootstrapper = require('./lib/bootstrapper.js')
module.exports = function (options) {
  return bootstrapper(options).start().then(function (b) {
    return b.reporter
  })
}

module.exports.Reporter = require('./lib/reporter.js')
module.exports.bootstrapper = require('./lib/bootstrapper.js')
