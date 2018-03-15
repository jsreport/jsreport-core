const core = require('../index.js')
const path = require('path')
const winston = require('winston')
const stdMocks = require('std-mocks')
const should = require('should')
const fs = require('fs')

describe('reporter', () => {
  beforeEach(() => {
    // cleaning transports for each each test
    if (winston.loggers.has('jsreport')) {
      Object.keys(winston.loggers.get('jsreport').transports).forEach((transpName) => {
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
    safeUnlink(path.join(__dirname, 'custom.config.json'))
  })

  it('should not log to console by default', async () => {
    const reporter = core({ discover: false })

    stdMocks.use({ print: true })
    await reporter.init()
    await reporter.render({
      template: {
        content: 'Hey',
        engine: 'none',
        recipe: 'html'
      }
    })
    stdMocks.restore()
    const stdoutContent = stdMocks.flush()
    stdoutContent.stdout.length.should.be.eql(0)
  })

  it('should silent logs', async () => {
    const reporter = core({ discover: false, logger: { silent: true } })

    stdMocks.use({ print: true })

    await reporter.init()
    await reporter.render({
      template: {
        content: 'Hey',
        engine: 'none',
        recipe: 'html'
      }
    })
    stdMocks.restore()
    let stdoutContent = stdMocks.flush()
    stdoutContent.stdout.length.should.be.eql(0)

    const allTransportsAreSilent = Object.keys(reporter.logger.transports).every(function (transportName) {
      return reporter.logger.transports[transportName].silent === true
    })

    allTransportsAreSilent.should.be.eql(true)
  })

  it('should have Debug transport for logs enabled by default', async () => {
    const reporter = core({ discover: false })

    await reporter.init()
    reporter.logger.transports.debug.should.be.not.Undefined()
  })

  it('should fail to configure custom transport that do not have minimal options', () => {
    const reporter = core({
      discover: false,
      logger: {
        console: { transport: 'console' }
      }
    })

    const init = reporter.init()

    should(init).be.rejectedWith(/option "level" is not specified/)
  })

  it('should not load disabled transports for logs', async () => {
    const reporter = core({
      discover: false,
      logger: {
        console: { transport: 'console', level: 'debug' },
        memory: { transport: 'memory', level: 'debug', enabled: false }
      }
    })

    await reporter.init()
    reporter.logger.transports.console.should.be.not.Undefined()
    should(reporter.logger.transports.memory).be.Undefined()
  })

  it('should configure custom transports for logs correctly', async () => {
    const reporter = core({
      discover: false,
      logger: {
        console: { transport: 'console', level: 'debug' },
        memory: { transport: 'memory', level: 'debug' }
      }
    })

    await reporter.init()
    reporter.logger.transports.console.should.be.not.Undefined()
    reporter.logger.transports.memory.should.be.not.Undefined()
  })

  it('should configure custom transport that uses external module for logs correctly', async () => {
    const reporter = core({
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

    await reporter.init()
    reporter.logger.transports.loggly.should.be.not.Undefined()
  })

  it('should be able to render html without any extension applied using promises', async () => {
    const reporter = core({ discover: false })

    await reporter.init()
    const resp = await reporter.render({ template: { content: 'Hey', engine: 'none', recipe: 'html' } })
    resp.content.toString().should.be.eql('Hey')
  })

  it('should auto discover extensions when no use called', async () => {
    const reporter = core({ rootDirectory: __dirname, extensionsLocationCache: false })
    await reporter.init()
    reporter.testExtensionInitialized.should.be.eql(true)
  })

  it('should be able to use custom extension', async () => {
    const reporter = core({ rootDirectory: path.join(__dirname) })
    let extensionInitialized = false
    reporter.use({
      name: 'test',
      main: function (reporter, definition) {
        extensionInitialized = true
      }
    })

    await reporter.init()
    extensionInitialized.should.be.eql(true)
  })

  it('should reject init if custom extension init fails', () => {
    const reporter = core({ rootDirectory: path.join(__dirname) })
    reporter.use({
      name: 'test',
      main: function (reporter, definition) {
        throw new Error('failing')
      }
    })

    return reporter.init().should.be.rejected()
  })

  it('should fire initializeListeners on custom extension', async () => {
    const reporter = core({ rootDirectory: path.join(__dirname) })
    let extensionInitialized = false
    reporter.use({
      name: 'test',
      main: function (reporter, definition) {
        reporter.initializeListeners.add('test', function () {
          extensionInitialized = true
        })
      }
    })

    await reporter.init()
    extensionInitialized.should.be.eql(true)
  })

  it('should parse dev.config.json when loadConfig and NODE_ENV=development', async () => {
    fs.writeFileSync(path.join(__dirname, 'dev.config.json'), JSON.stringify({ test: 'dev' }))
    process.env.NODE_ENV = 'development'
    const reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.test.should.be.eql('dev')
  })

  it('should parse prod.config.json when loadConfig and NODE_ENV=production', async () => {
    fs.writeFileSync(path.join(__dirname, 'prod.config.json'), JSON.stringify({ test: 'prod' }))
    process.env.NODE_ENV = 'production'
    const reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.test.should.be.eql('prod')
  })

  it('should parse jsreport.config.json when loadConfig and no ENV config files exist', async () => {
    fs.writeFileSync(path.join(__dirname, 'jsreport.config.json'), JSON.stringify({ test: 'jsreport' }))
    const reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.test.should.be.eql('jsreport')
  })

  it('should parse config with priority to ENV based file when loadConfig', async () => {
    process.env.NODE_ENV = null
    fs.writeFileSync(path.join(__dirname, 'dev.config.json'), JSON.stringify({ test: 'dev' }))
    fs.writeFileSync(path.join(__dirname, 'jsreport.config.json'), JSON.stringify({ test: 'jsreport' }))
    const reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.test.should.be.eql('dev')
  })

  it('should parse config from absolute configFile option when loadConfig', async () => {
    fs.writeFileSync(path.join(__dirname, 'custom.config.json'), JSON.stringify({ test: 'custom' }))
    const reporter = core({
      rootDirectory: path.join(__dirname),
      configFile: path.join(__dirname, 'custom.config.json'),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.test.should.be.eql('custom')
  })

  it('should parse config with priority to configFile option when loadConfig', async () => {
    fs.writeFileSync(path.join(__dirname, 'custom.config.json'), JSON.stringify({ test: 'custom' }))
    fs.writeFileSync(path.join(__dirname, 'jsreport.config.json'), JSON.stringify({ test: 'jsreport' }))
    const reporter = core({
      rootDirectory: path.join(__dirname),
      configFile: 'custom.config.json',
      loadConfig: true
    })

    await reporter.init()
    reporter.options.test.should.be.eql('custom')
  })

  it('should throw when configFile not found and loadConfig', (done) => {
    const reporter = core({
      rootDirectory: path.join(__dirname),
      configFile: 'custom.config.json',
      loadConfig: true
    })

    reporter.init().then(function () {
      reporter.options.test.should.be.eql('custom')
      done(new Error('should have failed'))
    }).catch(function (err) {
      err.toString().should.containEql('custom.config.json')
      done()
    })
  })

  it('should parse env options into reporter options when loadConfig', async () => {
    process.env.httpPort = 4000
    process.env.NODE_ENV = 'development'
    const reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.httpPort.toString().should.be.eql('4000')
  })

  it('should use options provided as argument  when loadConfig', () => {
    delete process.env.httpPort
    process.env.NODE_ENV = 'development'
    const reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true,
      httpPort: 6000
    })

    reporter.init()
    reporter.options.httpPort.should.be.eql(6000)
  })

  it('should skip extension with enabled === false in config', async () => {
    const reporter = core({ rootDirectory: __dirname, test: { enabled: false } })
    await reporter.init()
    should(reporter.testExtensionInitialized).not.eql(true)
  })

  it('should use both discovered and used extensions if discover true', async () => {
    const reporter = core({ rootDirectory: path.join(__dirname) })
    let extensionInitialized = false
    reporter.discover()
    reporter.use({
      name: 'foo',
      main: function (reporter, definition) {
        extensionInitialized = true
      }
    })

    await reporter.init()
    extensionInitialized.should.be.eql(true)
    reporter.testExtensionInitialized.should.be.ok()
  })

  it('should accept plain functions in use', async () => {
    const reporter = core()

    let extensionInitialized = false
    reporter.use(function (reporter, definition) {
      extensionInitialized = true
    })

    await reporter.init()
    extensionInitialized.should.be.eql(true)
  })

  it('should fire closeListeners on close', async () => {
    const reporter = core({ rootDirectory: path.join(__dirname) })
    await reporter.init()
    let fired = false
    reporter.closeListeners.add('test', () => (fired = true))
    await reporter.close()
    fired.should.be.true()
  })

  it('should kill scripts manager on close', async () => {
    const reporter = core({ rootDirectory: path.join(__dirname) })
    await reporter.init()
    let killed = false
    reporter.scriptManager.kill = () => (killed = true)
    await reporter.close()
    killed.should.be.true()
  })

  it('should reject second init', async () => {
    const reporter = core({ rootDirectory: path.join(__dirname) })
    await reporter.init()
    return reporter.init().should.be.rejected()
  })
})
