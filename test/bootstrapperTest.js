var path = require('path')
var bootstrapper = require('../lib/bootstrapper.js')
var tmpDir = path.join(require('os').tmpDir(), 'jsreport')
require('should')

describe('bootstrapper', function () {
  it('should parse dev.config.json', function (done) {
    process.env.NODE_ENV = 'development'
    bootstrapper({
      rootDirectory: path.join(__dirname),
      logger: { providerName: 'console' },
      tempDirectory: tmpDir
    }).start().then(function (b) {
      b.reporter.options.httpPort.should.be.eql(2000)
      done()
    }).catch(done)
  })

  it('should parse prod.config.json', function (done) {
    process.env.NODE_ENV = 'production'
    bootstrapper({
      rootDirectory: path.join(__dirname),
      logger: { providerName: 'console' },
      tempDirectory: tmpDir
    }).start().then(function (b) {
      b.reporter.options.httpPort.should.be.eql(3000)
      done()
    }).catch(done)
  })

  it('should parse env options into reporter options', function (done) {
    process.env.httpPort = '4000'
    bootstrapper({
      rootDirectory: path.join(__dirname),
      logger: { providerName: 'console' },
      tempDirectory: tmpDir
    }).start().then(function (b) {
      b.reporter.options.httpPort.should.be.eql('4000')
      done()
    }).catch(done)
  })

  it('should use options provided as argument', function (done) {
    delete process.env.httpPort
    bootstrapper({
      rootDirectory: path.join(__dirname),
      logger: { providerName: 'console' },
      tempDirectory: tmpDir,
      httpPort: 6000
    }).start().then(function (b) {
      b.reporter.options.httpPort.should.be.eql(6000)
      done()
    }).catch(done)
  })
})
