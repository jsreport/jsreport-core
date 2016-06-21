var discover = require('../../lib/extensions/discover')
var Logger = require('../util/testLogger')
var os = require('os')
require('should')

describe('discover', function () {
  var config

  beforeEach(function (done) {
    config = {
      logger: new Logger(),
      tempDirectory: os.tmpdir(),
      rootDirectory: __dirname
    }
    done()
  })

  it('should find the extension', function (done) {
    discover(config).then(function (extensions) {
      extensions.should.have.length(1)
      done()
    }).catch(done)
  })
})
