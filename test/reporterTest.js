var core = require('../index.js')
var path = require('path')
require('should')

describe('reporter', function () {
  it('should be able to render html without any extension applied using promises', function (done) {
    var reporter = core({discover: false})

    reporter.init().then(function () {
      return reporter.render({template: {content: 'Hey', engine: 'none', recipe: 'html'}}).then(function (resp) {
        resp.content.toString().should.be.eql('Hey')
        done()
      })
    }).catch(done)
  })

  it('should auto discover extensions when no use called', function (done) {
    var reporter = core({rootDirectory: __dirname})
    reporter.init().then(function () {
      reporter.testExtensionInitialized.should.be.eql(true)
      done()
    }).catch(done)
  })

  it('should be able to use custom extension', function (done) {
    var reporter = core({rootDirectory: path.join(__dirname)})
    var extensionInitialized = false
    reporter.use({
      name: 'test',
      main: function (reporter, definition) {
        extensionInitialized = true
      }
    })

    reporter.init().then(function () {
      extensionInitialized.should.be.eql(true)
      done()
    }).catch(done)
  })

  it('should fire initializeListeners on custom extension', function (done) {
    var reporter = core({rootDirectory: path.join(__dirname)})
    var extensionInitialized = false
    reporter.use({
      name: 'test',
      main: function (reporter, definition) {
        reporter.initializeListener.add('test', function () {
          extensionInitialized = true
        })
      }
    })

    reporter.init().then(function () {
      extensionInitialized.should.be.eql(true)
      done()
    }).catch(done)
  })

  it('should parse dev.config.json when loadConfig', function (done) {
    process.env.NODE_ENV = 'development'
    var reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    reporter.init().then(function () {
      reporter.options.httpPort.should.be.eql(2000)
      done()
    }).catch(done)
  })

  it('should parse prod.config.json when loadConfig', function (done) {
    process.env.NODE_ENV = 'production'
    var reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    reporter.init().then(function () {
      reporter.options.httpPort.should.be.eql(3000)
      done()
    }).catch(done)
  })

  it('should parse env options into reporter options when loadConfig', function (done) {
    process.env.httpPort = 4000
    process.env.NODE_ENV = 'development'
    var reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    reporter.init().then(function () {
      reporter.options.httpPort.toString().should.be.eql('4000')
      done()
    }).catch(done)
  })

  it('should use options provided as argument  when loadConfig', function (done) {
    delete process.env.httpPort
    process.env.NODE_ENV = 'development'
    var reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true,
      httpPort: 6000
    })

    reporter.init().then(function () {
      reporter.options.httpPort.should.be.eql(6000)
      done()
    }).catch(done)
  })

  it('should promisify blob storage', function (done) {
    var reporter = core({discover: false})

    reporter.init().then(function () {
      return reporter.blobStorage.write('test', new Buffer('str'), {}, {}).then(function () {
        return reporter.blobStorage.read('test').then(function (stream) {
          var content = ''
          stream.on('data', function (buf) {
            content += buf.toString()
          })
          stream.on('end', function () {
            content.should.be.eql('str')
            done()
          })
        })
      })
    }).catch(done)
  })
})

