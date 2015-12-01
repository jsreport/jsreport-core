// var bootstrapper = require('./lib/bootstrapper.js')

/* module.exports = function (options) {
 return bootstrapper(options).start().then(function (b) {
 return b.reporter
 })
 }*/

var Reporter = require('./lib/reporter.js')
var bootstrapper = require('./lib/bootstrapper.js')

module.exports.Reporter = Reporter
module.exports.bootstrapper = bootstrapper

module.exports = function (options) {
  return new Reporter(options)
}
