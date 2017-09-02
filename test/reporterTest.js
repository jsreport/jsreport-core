var core = require('../index.js')
var path = require('path')
var winston = require('winston')
var stdMocks = require('std-mocks')
var should = require('should')
var fs = require('fs')

describe('reporter', function () {
  beforeEach(function () {
    // cleaning transports for each each test
    if (winston.loggers.has('jsreport')) {
      Object.keys(winston.loggers.get('jsreport').transports).forEach(function (transpName) {
        winston.loggers.get('jsreport').remove(transpName)
      })
    }

    function safeUnlink (p) {
      try {
        fs.unlinkSync(p)
      } catch (e) {

      }
    }

    safeUnlink(path.join(__dirname, 'prod.config.json'))
    safeUnlink(path.join(__dirname, 'dev.config.json'))
    safeUnlink(path.join(__dirname, 'jsreport.config.json'))
  })

  it('should not log to console by default', function (done) {
    var reporter = core({ discover: false })

    stdMocks.use({ print: true })

    reporter.init().then(function () {
      return reporter.render({
        template: {
          content: 'Hey',
          engine: 'none',
          recipe: 'html'
        }
      }).then(function () {
        var stdoutContent

        stdMocks.restore()

        stdoutContent = stdMocks.flush()

        stdoutContent.stdout.length.should.be.eql(0)
        done()
      })
    }).catch(function (err) {
      stdMocks.restore()

      done(err)
    })
  })

  it('should silent logs', function (done) {
    var reporter = core({ discover: false, logger: { silent: true } })

    stdMocks.use({ print: true })

    reporter.init().then(function () {
      return reporter.render({
        template: {
          content: 'Hey',
          engine: 'none',
          recipe: 'html'
        }
      }).then(function () {
        var stdoutContent

        stdMocks.restore()

        stdoutContent = stdMocks.flush()

        stdoutContent.stdout.length.should.be.eql(0)

        var allTransportsAreSilent = Object.keys(reporter.logger.transports).every(function (transportName) {
          return reporter.logger.transports[transportName].silent === true
        })

        allTransportsAreSilent.should.be.eql(true)

        done()
      })
    }).catch(function (err) {
      stdMocks.restore()

      done(err)
    })
  })

  it('should have Debug transport for logs enabled by default', function () {
    var reporter = core({ discover: false })

    return reporter.init().then(function () {
      reporter.logger.transports.debug.should.be.not.Undefined()
    })
  })

  it('should fail to configure custom transport that do not have minimal options', function () {
    var reporter = core({
      discover: false,
      logger: {
        console: { transport: 'console' }
      }
    })

    var init = reporter.init()

    should(init).be.rejectedWith(/option "level" is not specified/)
  })

  it('should not load disabled transports for logs', function () {
    var reporter = core({
      discover: false,
      logger: {
        console: { transport: 'console', level: 'debug' },
        memory: { transport: 'memory', level: 'debug', enabled: false }
      }
    })

    return reporter.init().then(function () {
      reporter.logger.transports.console.should.be.not.Undefined()
      should(reporter.logger.transports.memory).be.Undefined()
    })
  })

  it('should configure custom transports for logs correctly', function () {
    var reporter = core({
      discover: false,
      logger: {
        console: { transport: 'console', level: 'debug' },
        memory: { transport: 'memory', level: 'debug' }
      }
    })

    return reporter.init().then(function () {
      reporter.logger.transports.console.should.be.not.Undefined()
      reporter.logger.transports.memory.should.be.not.Undefined()
    })
  })

  it('should configure custom transport that uses external module for logs correctly', function () {
    var reporter = core({
      discover: false,
      logger: {
        loggly: {
          module: 'winston-loggly',
          transport: 'Loggly',
          level: 'info',
          silent: true,
          subdomain: 'test',
          inputToken: 'really-long-token-you-got-from-loggly',
          auth: {
            username: 'your-username',
            password: 'your-password'
          }
        }
      }
    })

    return reporter.init().then(function () {
      reporter.logger.transports.loggly.should.be.not.Undefined()
    })
  })

  it('should be able to render html without any extension applied using promises', function (done) {
    var reporter = core({ discover: false })

    reporter.init().then(function () {
      return reporter.render({ template: { content: 'Hey', engine: 'none', recipe: 'html' } }).then(function (resp) {
        resp.content.toString().should.be.eql('Hey')
        done()
      })
    }).catch(done)
  })

  it('should auto discover extensions when no use called', function (done) {
    var reporter = core({ rootDirectory: __dirname, extensionsLocationCache: false })
    reporter.init().then(function () {
      reporter.testExtensionInitialized.should.be.eql(true)
      done()
    }).catch(done)
  })

  it('should be able to use custom extension', function (done) {
    var reporter = core({ rootDirectory: path.join(__dirname) })
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
    var reporter = core({ rootDirectory: path.join(__dirname) })
    var extensionInitialized = false
    reporter.use({
      name: 'test',
      main: function (reporter, definition) {
        reporter.initializeListeners.add('test', function () {
          extensionInitialized = true
        })
      }
    })

    reporter.init().then(function () {
      extensionInitialized.should.be.eql(true)
      done()
    }).catch(done)
  })

  it('should parse dev.config.json when loadConfig and NODE_ENV=development', function (done) {
    fs.writeFileSync(path.join(__dirname, 'dev.config.json'), JSON.stringify({ test: 'dev' }))
    process.env.NODE_ENV = 'development'
    var reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    reporter.init().then(function () {
      reporter.options.test.should.be.eql('dev')
      done()
    }).catch(done)
  })

  it('should parse prod.config.json when loadConfig and NODE_ENV=production', function (done) {
    fs.writeFileSync(path.join(__dirname, 'prod.config.json'), JSON.stringify({ test: 'prod' }))
    process.env.NODE_ENV = 'production'
    var reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    reporter.init().then(function () {
      reporter.options.test.should.be.eql('prod')
      done()
    }).catch(done)
  })

  it('should parse jsreport.config.json when loadConfig and no ENV config files exist', function (done) {
    fs.writeFileSync(path.join(__dirname, 'jsreport.config.json'), JSON.stringify({ test: 'jsreport' }))
    var reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    reporter.init().then(function () {
      reporter.options.test.should.be.eql('jsreport')
      done()
    }).catch(done)
  })

  it('should parse config with priority to ENV based file when loadConfig', function (done) {
    process.env.NODE_ENV = null
    fs.writeFileSync(path.join(__dirname, 'dev.config.json'), JSON.stringify({ test: 'dev' }))
    fs.writeFileSync(path.join(__dirname, 'jsreport.config.json'), JSON.stringify({ test: 'jsreport' }))
    var reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    reporter.init().then(function () {
      reporter.options.test.should.be.eql('dev')
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
    var reporter = core({ discover: false })

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

  it('should skip extension with enabled === false in config', function (done) {
    var reporter = core({ rootDirectory: __dirname, test: { enabled: false } })
    reporter.init().then(function () {
      should(reporter.testExtensionInitialized).not.eql(true)
      done()
    }).catch(done)
  })

  it('should use both discovered and used extensions if discover true', function (done) {
    var reporter = core({ rootDirectory: path.join(__dirname) })
    var extensionInitialized = false
    reporter.discover()
    reporter.use({
      name: 'foo',
      main: function (reporter, definition) {
        extensionInitialized = true
      }
    })

    reporter.init().then(function () {
      extensionInitialized.should.be.eql(true)
      reporter.testExtensionInitialized.should.be.ok
      done()
    }).catch(done)
  })

  it('should accept plain functions in use', function (done) {
    var reporter = core()

    var extensionInitialized = false
    reporter.use(function (reporter, definition) {
      extensionInitialized = true
    })

    reporter.init().then(function () {
      extensionInitialized.should.be.eql(true)
      done()
    }).catch(done)
  })
})
