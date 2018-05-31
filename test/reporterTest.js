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

  it('should create custom error', async () => {
    const reporter = core({
      discover: false
    })

    const error = reporter.createError('custom error testing', {
      code: 'UNAUTHORIZED',
      weak: true,
      statusCode: 401
    })

    error.should.be.Error()
    error.code.should.be.eql('UNAUTHORIZED')
    error.weak.should.be.eql(true)
    error.statusCode.should.be.eql(401)
  })

  it('should create custom error based on previous one', async () => {
    const reporter = core({
      discover: false
    })

    const error = reporter.createError('custom error testing', {
      code: 'UNAUTHORIZED',
      weak: true,
      statusCode: 401,
      original: new Error('original error')
    })

    error.should.be.Error()
    error.code.should.be.eql('UNAUTHORIZED')
    error.weak.should.be.eql(true)
    error.statusCode.should.be.eql(401)
    error.message.includes('custom error testing').should.be.eql(true)
    error.message.includes('original error').should.be.eql(true)
    error.stack.includes('original error').should.be.eql(true)
  })

  it('should be able to render html without any extension applied using promises', async () => {
    const reporter = core({ discover: false })

    await reporter.init()
    const resp = await reporter.render({ template: { content: 'Hey', engine: 'none', recipe: 'html' } })
    resp.content.toString().should.be.eql('Hey')
  })

  it('should auto discover extensions when no use called', async () => {
    const reporter = core({ rootDirectory: __dirname, useExtensionsLocationCache: false })
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

  describe('options json schema', () => {
    it('should register optionsSchema of custom extension', async () => {
      const reporter = core({ rootDirectory: path.join(__dirname) })
      const schema = {
        type: 'object',
        properties: {
          allowed: { type: 'boolean' }
        }
      }

      reporter.use({
        name: 'test',
        optionsSchema: {
          extensions: {
            test: schema
          }
        },
        main: (reporter, definition) => {}
      })

      await reporter.init()

      schema.properties.enabled = { type: 'boolean' }

      reporter.optionsValidator.getSchema('test').should.be.eql(Object.assign({
        $schema: reporter.optionsValidator.schemaVersion
      }, schema))
    })

    it('should register default json schema when extension does not use optionsSchema', async () => {
      const reporter = core({ rootDirectory: path.join(__dirname) })

      reporter.use({
        name: 'test',
        main: (reporter, definition) => {}
      })

      await reporter.init()

      reporter.optionsValidator.getSchema('test').should.be.eql(Object.assign({
        $schema: reporter.optionsValidator.schemaVersion
      }, {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' }
        }
      }))
    })

    it('should allow extensions to extend array values of root schema', async () => {
      const reporter = core({ rootDirectory: path.join(__dirname) })

      reporter.use({
        name: 'test',
        optionsSchema: {
          store: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['fs'] }
            }
          }
        },
        main: (reporter, definition) => {}
      })

      await reporter.init()

      const rootSchema = reporter.optionsValidator.getRootSchema()

      rootSchema.properties.store.properties.provider.enum.should.be.eql(['memory', 'fs'])
    })

    it('should validate and coerce options of custom extension', async () => {
      const reporter = core({ rootDirectory: path.join(__dirname) })
      let options

      reporter.use({
        name: 'test',
        optionsSchema: {
          extensions: {
            test: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                timeout: { type: 'number' },
                printBackground: { type: 'boolean' }
              }
            }
          }
        },
        options: {
          name: 'testing',
          timeout: '10000',
          printBackground: 'true'
        },
        main: (reporter, definition) => { options = definition.options }
      })

      await reporter.init()

      options.name.should.be.eql('testing')
      options.timeout.should.be.eql(10000)
      options.printBackground.should.be.true()
    })

    it('should validate and corce special string option to array', async () => {
      const reporter = core({ rootDirectory: path.join(__dirname) })

      let options

      reporter.use({
        name: 'test',
        optionsSchema: {
          extensions: {
            test: {
              type: 'object',
              properties: {
                sampleModules: { type: 'string', '$jsreport-constantOrArray': ['*'] },
                allowedModules: { type: 'string', '$jsreport-constantOrArray': ['*'] }
              }
            }
          }
        },
        options: {
          sampleModules: '*',
          allowedModules: 'request,lodash,moment'
        },
        main: (reporter, definition) => { options = definition.options }
      })

      await reporter.init()

      options.sampleModules.should.be.eql('*')
      options.allowedModules.should.be.eql(['request', 'lodash', 'moment'])
    })

    it('should validate and keep date object of custom extension', async () => {
      const reporter = core({ rootDirectory: path.join(__dirname) })

      let options

      reporter.use({
        name: 'test',
        optionsSchema: {
          extensions: {
            test: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                modificationDate: { '$jsreport-acceptsDate': true }
              }
            }
          }
        },
        options: {
          name: 'testing',
          modificationDate: new Date()
        },
        main: (reporter, definition) => { options = definition.options }
      })

      await reporter.init()

      options.name.should.be.eql('testing')
      should(options.modificationDate).be.Date()
    })

    it('should validate and keep buffer object of custom extension', async () => {
      const reporter = core({ rootDirectory: path.join(__dirname) })
      let options

      reporter.use({
        name: 'test',
        optionsSchema: {
          extensions: {
            test: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                rawContent: { '$jsreport-acceptsBuffer': true }
              }
            }
          }
        },
        options: {
          name: 'testing',
          rawContent: Buffer.from('testing')
        },
        main: (reporter, definition) => { options = definition.options }
      })

      await reporter.init()

      options.name.should.be.eql('testing')
      should(Buffer.isBuffer(options.rawContent)).be.true()
    })

    it('should validate and coerce options when trying to override root options after extension init', async () => {
      const reporter = core({ rootDirectory: path.join(__dirname) })
      let options

      reporter.use({
        name: 'test',
        optionsSchema: {
          extensions: {
            test: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                timeout: { type: 'number' },
                printBackground: { type: 'boolean' }
              }
            }
          }
        },
        options: {
          name: 'testing',
          timeout: '10000',
          printBackground: 'true'
        },
        main: (reporter, definition) => {
          definition.options = Object.assign({}, definition.options, {
            timeout: '20000',
            printBackground: 'false'
          })

          options = definition.options
        }
      })

      await reporter.init()

      options.name.should.be.eql('testing')
      options.timeout.should.be.eql(20000)
      options.printBackground.should.be.false()
    })

    it('should validate when extension config is specified both in top level and inline', async () => {
      const reporter = core({
        rootDirectory: path.join(__dirname),
        extensions: {
          'test': {
            name: 'testing'
          }
        }
      })

      let options

      reporter.use({
        name: 'test',
        optionsSchema: {
          extensions: {
            test: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                runtimeName: { type: 'string' }
              },
              required: ['name', 'runtimeName']
            }
          }
        },
        options: {
          runtimeName: 'testing'
        },
        main: (reporter, definition) => { options = definition.options }
      })

      await reporter.init()

      options.name.should.be.eql('testing')
      options.runtimeName.should.be.eql('testing')
    })

    it('should reject on invalid options of custom extension', async () => {
      const reporter = core({ rootDirectory: path.join(__dirname) })

      reporter.use({
        name: 'test',
        optionsSchema: {
          extensions: {
            test: {
              type: 'object',
              properties: {
                printBackground: { type: 'boolean' }
              }
            }
          }
        },
        options: {
          printBackground: 10
        },
        main: (reporter, definition) => { }
      })

      return reporter.init().should.be.rejectedWith(/does not match the defined schema/)
    })
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

  it('should use options provided as argument  when loadConfig', async () => {
    delete process.env.httpPort
    process.env.NODE_ENV = 'development'
    const reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true,
      httpPort: 6000
    })

    await reporter.init()
    reporter.options.httpPort.should.be.eql(6000)
  })

  it('should support camel case alias for configuration of extensions', async () => {
    const reporter = core({
      rootDirectory: path.join(__dirname),
      extensions: {
        customExtension: {
          testing: true
        }
      }
    })

    let extensionOptions

    reporter.use({
      name: 'custom-extension',
      main: function (reporter, definition) {
        extensionOptions = definition.options
      }
    })

    await reporter.init()

    extensionOptions.testing.should.be.true()
  })

  it('should skip extension with enabled === false in config', async () => {
    const reporter = core({rootDirectory: __dirname, extensions: {test: {enabled: false}}})
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
