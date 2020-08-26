const core = require('../index.js')
const path = require('path')
const promisify = require('util').promisify
const rimraf = promisify(require('rimraf'))
const winston = require('winston')
const stdMocks = require('std-mocks')
const should = require('should')
const fs = require('fs')

const originalArgs = process.argv
const originalEnv = process.env

describe('reporter', () => {
  let reporter
  async function clean () {
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
    if (fs.existsSync(path.join(__dirname, 'tmp'))) {
      await rimraf(path.join(__dirname, 'tmp'))
    } else {
      fs.mkdirSync(path.join(__dirname, 'tmp'))
    }
  }

  beforeEach(async () => {
    process.argv = [ ...originalArgs ]
    process.env = { ...originalEnv }

    if (fs.existsSync(path.join(__dirname, 'jsreport.config.json'))) {
      fs.unlinkSync(path.join(__dirname, 'jsreport.config.json'))
    }

    Object.keys(process.env).filter(e => e.startsWith('extensions')).forEach((e) => (process.env[e] = null))
    // cleaning transports for each each test
    if (winston.loggers.has('jsreport')) {
      Object.keys(winston.loggers.get('jsreport').transports).forEach((transpName) => {
        winston.loggers.get('jsreport').remove(transpName)
      })
    }

    await clean()
  })

  afterEach(async () => {
    try {
      await reporter.close()
    } catch (e) {

    }
    await clean()
  })

  it('should not log to console by default', async () => {
    reporter = core({ discover: false })

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
    reporter = core({ discover: false, logger: { silent: true } })

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

    const allTransportsAreSilent = Object.keys(reporter.logger.transports).every(function (transportName) {
      return reporter.logger.transports[transportName].silent === true
    })

    allTransportsAreSilent.should.be.eql(true)
  })

  it('should have Debug transport for logs enabled by default', async () => {
    reporter = core({ discover: false })

    await reporter.init()
    reporter.logger.transports.debug.should.be.not.Undefined()
  })

  it('should fail to configure custom transport that do not have minimal options', () => {
    reporter = core({
      discover: false,
      logger: {
        console: { transport: 'console' }
      }
    })

    const init = reporter.init()

    should(init).be.rejectedWith(/option "level" is not specified/)
  })

  it('should not load disabled transports for logs', async () => {
    reporter = core({
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
    reporter = core({
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
    reporter = core({
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
    reporter = core({
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
    reporter = core({
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
    reporter = core({ discover: false })

    await reporter.init()
    const resp = await reporter.render({ template: { content: 'Hey', engine: 'none', recipe: 'html' } })
    resp.content.toString().should.be.eql('Hey')
  })

  it('should auto discover extensions when no use called', async () => {
    reporter = core({ rootDirectory: __dirname, useExtensionsLocationCache: false })
    await reporter.init()
    reporter.testExtensionInitialized.should.be.eql(true)
  })

  it('should be able to use custom extension', async () => {
    reporter = core({ rootDirectory: path.join(__dirname) })
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
      reporter = core({ rootDirectory: path.join(__dirname) })

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
      reporter = core({ rootDirectory: path.join(__dirname) })

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
      reporter = core({ rootDirectory: path.join(__dirname) })

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
      reporter = core({ rootDirectory: path.join(__dirname) })
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
      reporter = core({ rootDirectory: path.join(__dirname) })

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
      reporter = core({ rootDirectory: path.join(__dirname) })

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

    it('should validate and sanitize date type of custom extension', async () => {
      reporter = core({ rootDirectory: path.join(__dirname) })

      let options

      reporter.use({
        name: 'test',
        optionsSchema: {
          extensions: {
            test: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                modificationDate: { anyOf: [{ '$jsreport-stringToDate': true }, { '$jsreport-acceptsDate': true }] },
                modificationDate2: { anyOf: [{ '$jsreport-stringToDate': true }, { '$jsreport-acceptsDate': true }] }
              }
            }
          }
        },
        options: {
          name: 'testing',
          modificationDate: new Date(),
          modificationDate2: new Date().toISOString()
        },
        main: (reporter, definition) => { options = definition.options }
      })

      await reporter.init()

      options.name.should.be.eql('testing')
      should(options.modificationDate).be.Date()
      should(options.modificationDate2).be.Date()
    })

    it('should validate and keep buffer object of custom extension', async () => {
      reporter = core({ rootDirectory: path.join(__dirname) })
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
      reporter = core({ rootDirectory: path.join(__dirname) })
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
      reporter = core({
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
      reporter = core({ rootDirectory: path.join(__dirname) })

      reporter.use({
        name: 'custom',
        optionsSchema: {
          extensions: {
            custom: {
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
    reporter = core({ rootDirectory: path.join(__dirname) })
    reporter.use({
      name: 'test',
      main: function (reporter, definition) {
        throw new Error('failing')
      }
    })

    return reporter.init().should.be.rejected()
  })

  it('should fire initializeListeners on custom extension', async () => {
    reporter = core({ rootDirectory: path.join(__dirname) })
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
    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.test.should.be.eql('dev')
  })

  it('should parse prod.config.json when loadConfig and NODE_ENV=production', async () => {
    fs.writeFileSync(path.join(__dirname, 'prod.config.json'), JSON.stringify({ test: 'prod' }))
    process.env.NODE_ENV = 'production'
    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.test.should.be.eql('prod')
  })

  it('should parse jsreport.config.json when loadConfig and no ENV config files exist', async () => {
    fs.writeFileSync(path.join(__dirname, 'jsreport.config.json'), JSON.stringify({ test: 'jsreport' }))
    reporter = core({
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
    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.test.should.be.eql('dev')
  })

  it('should parse config from absolute configFile option when loadConfig', async () => {
    fs.writeFileSync(path.join(__dirname, 'custom.config.json'), JSON.stringify({ test: 'custom' }))
    reporter = core({
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
    reporter = core({
      rootDirectory: path.join(__dirname),
      configFile: 'custom.config.json',
      loadConfig: true
    })

    await reporter.init()
    reporter.options.test.should.be.eql('custom')
  })

  it('should throw when configFile not found and loadConfig', (done) => {
    reporter = core({
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
    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.httpPort.toString().should.be.eql('4000')
  })

  it('should parse env options and sanitize earlier options with schema into reporter options when loadConfig', async () => {
    process.env.allowLocalFilesAccess = 'true'
    process.env.NODE_ENV = 'development'
    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    reporter.afterConfigLoaded((r) => {
      r.options.allowLocalFilesAccess.should.be.eql(true)
    })

    await reporter.init()
  })

  it('should parse both separators of env options into reporter options', async () => {
    process.env['some_object'] = 'some'
    process.env['another:object'] = 'another'

    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    await reporter.init()
    reporter.options.some.object.should.be.eql('some')
    reporter.options.another.object.should.be.eql('another')
  })

  it('should use options provided as argument  when loadConfig', async () => {
    delete process.env.httpPort
    process.env.NODE_ENV = 'development'
    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true,
      httpPort: 6000
    })

    await reporter.init()
    reporter.options.httpPort.should.be.eql(6000)
  })

  it('should load config with nested key for configuration of extensions', async () => {
    process.env['extensions:custom-extension:cookieSession:secret'] = 'secret'

    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    let extensionOptions

    reporter.use({
      name: 'custom-extension',
      main: function (reporter, definition) {
        extensionOptions = definition.options
      }
    })

    await reporter.init()

    reporter.options.extensions['custom-extension'].cookieSession.secret.should.be.eql('secret')
    extensionOptions.cookieSession.secret.should.be.eql('secret')
  })

  it('should support camel case alias for configuration of extensions', async () => {
    reporter = core({
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

  it('should merge camel case config from env over config file values for configuration of extensions', async () => {
    fs.writeFileSync(path.join(__dirname, 'jsreport.config.json'), JSON.stringify({ extensions: { 'custom-extension': { foo: 'fromfile' } } }))
    process.env['extensions_customExtension_foo'] = 'fromenv'
    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    let extensionOptions

    reporter.use({
      name: 'custom-extension',
      main: function (reporter, definition) {
        extensionOptions = definition.options
      }
    })

    await reporter.init()
    extensionOptions.foo.should.be.eql('fromenv')
  })

  it('should merge camel case config from arg over env values for configuration of extensions', async () => {
    process.argv.push('--extensions.customExtension.foo')
    process.argv.push('fromarg')

    process.env['extensions_customExtension_foo'] = 'fromenv'
    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    let extensionOptions

    reporter.use({
      name: 'custom-extension',
      main: function (reporter, definition) {
        extensionOptions = definition.options
      }
    })

    await reporter.init()
    extensionOptions.foo.should.be.eql('fromarg')
  })

  it('should not loose values when using both camel case and normal config from arg values for configuration of extensions', async () => {
    process.argv.push('--extensions.customExtension.foo')
    process.argv.push('fromarg-normal')
    process.argv.push('--extensions.custom-extension.foo')
    process.argv.push('fromarg-camel')
    process.argv.push('--extensions.custom-extension.bar')
    process.argv.push('fromarg2-camel')

    reporter = core({
      rootDirectory: path.join(__dirname),
      loadConfig: true
    })

    let extensionOptions

    reporter.use({
      name: 'custom-extension',
      main: function (reporter, definition) {
        extensionOptions = definition.options
      }
    })

    await reporter.init()
    extensionOptions.foo.should.be.eql('fromarg-normal')
    extensionOptions.bar.should.be.eql('fromarg2-camel')
  })

  it('should skip extension with enabled === false in config', async () => {
    reporter = core({rootDirectory: __dirname, extensions: {test: {enabled: false}}})
    await reporter.init()
    should(reporter.testExtensionInitialized).not.eql(true)
  })

  it('should use both discovered and used extensions if discover true', async () => {
    reporter = core({ rootDirectory: path.join(__dirname) })
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
    reporter = core()

    let extensionInitialized = false
    reporter.use(function (reporter, definition) {
      extensionInitialized = true
    })

    await reporter.init()
    extensionInitialized.should.be.eql(true)
  })

  it('should fire closeListeners on close', async () => {
    reporter = core({ rootDirectory: path.join(__dirname) })
    await reporter.init()
    let fired = false
    reporter.closeListeners.add('test', () => (fired = true))
    await reporter.close()
    fired.should.be.true()
  })

  it('should kill scripts manager on close', async () => {
    reporter = core({ rootDirectory: path.join(__dirname) })
    await reporter.init()
    let killed = false
    reporter.scriptManager.kill = () => (killed = true)
    await reporter.close()
    killed.should.be.true()
  })

  it('should reject second init', async () => {
    reporter = core({ rootDirectory: path.join(__dirname) })
    await reporter.init()
    return reporter.init().should.be.rejected()
  })

  it('should ensure temp directory exists when using ensureTempDirectoryExists', async () => {
    const tempDirectory = path.join(__dirname, 'tmp')

    reporter = core({
      rootDirectory: path.join(__dirname),
      tempDirectory
    })

    await reporter.init()

    rimraf.sync(tempDirectory)

    const { directoryPath } = await reporter.ensureTempDirectoryExists()

    should(fs.existsSync(directoryPath)).be.eql(true)
  })

  it('should throw error when try to use ensureTempDirectoryExists but instance is not initialized', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    return should(reporter.ensureTempDirectoryExists()).be.rejectedWith(/Can not use ensureTempDirectoryExists/)
  })

  it('should create temp file using writeTempFile', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    await reporter.init()

    const result = await reporter.writeTempFile((uuid) => `something-${uuid}.txt`, 'testing')

    should(fs.existsSync(result.pathToFile)).be.eql(true)
    should(fs.readFileSync(result.pathToFile).toString()).be.eql('testing')
  })

  it('should throw error when try to use writeTempFile but instance is not initialized', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    return should(reporter.writeTempFile((uuid) => `something-${uuid}.txt`, 'testing')).be.rejectedWith(/Can not use writeTempFile/)
  })

  it('should throw error when filenameFn passed to writeTempFile does not return filename', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    await reporter.init()

    return should(reporter.writeTempFile((uuid) => '')).be.rejectedWith(/No valid filename was returned/)
  })

  it('should create temp file using writeTempFile (if temp directory is deleted)', async () => {
    const tempDirectory = path.join(__dirname, 'tmp')

    reporter = core({
      rootDirectory: path.join(__dirname),
      tempDirectory
    })

    await reporter.init()

    rimraf.sync(tempDirectory)

    const result = await reporter.writeTempFile((uuid) => `something-${uuid}.txt`, 'testing')

    should(fs.existsSync(result.pathToFile)).be.eql(true)
    should(fs.readFileSync(result.pathToFile).toString()).be.eql('testing')
  })

  it('should create temp file using writeTempFileStream', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    await reporter.init()

    const result = await reporter.writeTempFileStream((uuid) => `something-${uuid}.txt`)

    should(result.stream).have.property('writable')

    result.stream.on('finish', () => {
      should(fs.existsSync(result.pathToFile)).be.eql(true)
      should(fs.readFileSync(result.pathToFile).toString()).be.eql('testing')
    })

    result.stream.end('testing')
  })

  it('should throw error when try to use writeTempFileStream but instance is not initialized', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    return should(reporter.writeTempFileStream((uuid) => `something-${uuid}.txt`)).be.rejectedWith(/Can not use writeTempFileStream/)
  })

  it('should throw error when filenameFn passed to writeTempFileStream does not return filename', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    await reporter.init()

    return should(reporter.writeTempFileStream((uuid) => '')).be.rejectedWith(/No valid filename was returned/)
  })

  it('should create temp file using writeTempFileStream (if temp directory is deleted)', async () => {
    const tempDirectory = path.join(__dirname, 'tmp')

    reporter = core({
      rootDirectory: path.join(__dirname),
      tempDirectory
    })

    await reporter.init()

    rimraf.sync(tempDirectory)

    const result = await reporter.writeTempFileStream((uuid) => `something-${uuid}.txt`)

    should(result.stream).have.property('writable')

    result.stream.on('finish', () => {
      should(fs.existsSync(result.pathToFile)).be.eql(true)
      should(fs.readFileSync(result.pathToFile).toString()).be.eql('testing')
    })

    result.stream.end('testing')
  })

  it('should read temp file using readTempFile', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    await reporter.init()

    const { filename } = await reporter.writeTempFile((uuid) => `something-${uuid}.txt`, 'testing')

    const result = await reporter.readTempFile(filename)

    should(fs.existsSync(result.pathToFile)).be.eql(true)
    should(result.content.toString()).be.eql('testing')
  })

  it('should throw error when try to use readTempFile but instance is not initialized', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    return should(reporter.readTempFile('something.txt')).be.rejectedWith(/Can not use readTempFile/)
  })

  it('should read temp file using readTempFileStream', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    await reporter.init()

    const { filename } = await reporter.writeTempFile((uuid) => `something-${uuid}.txt`, 'testing')

    const result = await reporter.readTempFileStream(filename)

    should(fs.existsSync(result.pathToFile)).be.eql(true)
    should(result.stream).have.property('readable')

    const content = await new Promise((resolve, reject) => {
      const body = []

      result.stream.on('error', reject)

      result.stream.on('data', (chunk) => {
        body.push(chunk)
      })

      result.stream.on('end', () => {
        resolve(Buffer.concat(body))
      })
    })

    should(content.toString()).be.eql('testing')
  })

  it('should throw error when try to use readTempFileStream but instance is not initialized', async () => {
    reporter = core({
      rootDirectory: path.join(__dirname)
    })

    return should(reporter.readTempFileStream('something.txt')).be.rejectedWith(/Can not use readTempFileStream/)
  })

  it('executeScript should be able to return a promised value', async () => {
    fs.writeFileSync(path.join(__dirname, 'tmp', 'testScript.js'), `
      module.exports = (inputs, callbackAsync) => {
        return callbackAsync()
      }
    `)
    fs.writeFileSync(path.join(__dirname, 'tmp', 'testCallbackScript.js'), `
      module.exports = (reporter, originalReq, spec) => {
        return {         
          message: 'ok'
        }          
      }
    `)

    reporter = core({ discover: false, templatingEngines: {strategy: 'in-process'} })
    await reporter.init()
    const r = await reporter.executeScript({
      request: reporter.Request({ template: { content: 'foo', engine: 'none', recipe: 'html' } })
    }, {
      execModulePath: path.join(__dirname, 'tmp', 'testScript.js'),
      callbackModulePath: path.join(__dirname, 'tmp', 'testCallbackScript.js')
    }, reporter.Request({ template: { } }))
    r.message.should.be.eql('ok')
  })

  it('executeScript should propagate back context.shared', async () => {
    fs.writeFileSync(path.join(__dirname, 'tmp', 'testScript.js'), `
      module.exports = async (inputs, renderCallbackAsync) => {                
        await renderCallbackAsync({})        
        inputs.request.context.shared.array.push(3)  
        return {}       
      }
    `)

    fs.writeFileSync(path.join(__dirname, 'tmp', 'testCallback.js'), `
      module.exports = async (reporter, originalReq, spec) => {      
        originalReq.context.shared.array.push(2)     
        return {}       
      }
   `)

    reporter = core({ discover: false, templatingEngines: {strategy: 'dedicated-process'} })
    await reporter.init()

    const req = reporter.Request({ template: { }, context: { shared: { array: [1] } } })

    await reporter.executeScript({
      request: req
    }, {
      execModulePath: path.join(__dirname, 'tmp', 'testScript.js'),
      callbackModulePath: path.join(__dirname, 'tmp', 'testCallback.js')
    }, req)

    req.context.shared.array.should.have.length(3)
    req.context.shared.array[0].should.be.eql(1)
    req.context.shared.array[1].should.be.eql(2)
    req.context.shared.array[2].should.be.eql(3)
  })
})
