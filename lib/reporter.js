/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * Reporter main class including all methods jsreport-core exposes.
 */

const events = require('events')
const path = require('path')
const DocumentStore = require('./store/documentStore.js')
const BlobStorage = require('./blobStorage/blobStorage.js')
const Promise = require('bluebird')
const fs = require('fs')
const extend = require('node.extend.without.arrays')
const Settings = require('./util/settings.js')
const SchemaValidator = require('./util/schemaValidator')
const tempFilesHandler = require('./util/tempFilesHandler')
const executeScriptFn = require('./util/executeScript')
const getAvailableRenderTimeoutFn = require('./util/getAvailableRenderTimeout')
const encryption = require('./util/encryption')
const ExtensionsManager = require('./extensions/extensionsManager.js')
const ListenerCollection = require('listener-collection')
const Reaper = require('reap2')
const mkdirp = require('mkdirp')
const winston = require('winston')
const nconf = require('nconf')
const ScriptManager = require('script-manager')
const Request = require('./render/request')
const getRootOptionsSchema = require('./optionsSchema')
const decamelize = require('decamelize')
const folders = require('./folders')

const {
  validateDuplicatedName
} = require('./folders/validateDuplicatedName')

const {
  validateReservedName
} = require('./folders/validateReservedName')

const {
  getDefaultTempDirectory,
  getDefaultRootDirectory,
  getDefaultMode,
  getDefaultLoadConfig
} = require('./defaults')

const createOrExtendError = require('./util/createError')
const checkEntityName = require('./util/validateEntityName')
const setupValidateId = require('./store/setupValidateId')
const setupValidateHumanReadableKey = require('./store/setupValidateHumanReadableKey')
const extendRootOptionsSchema = require('./util/extendRootOptionsSchema')
const DebugTransport = require('./util/debugTransport')
const render = require('./render/render')
const htmlRecipe = require('./render/htmlRecipe')
const appRoot = require('app-root-path')
const omit = require('lodash.omit')
const DEFAULT_TASK_STRATEGY = 'dedicated-process'

const requestContextMetaConfigCollection = new WeakMap()
const extraPathsToCleanupCollection = new WeakMap()

module.exports = class Reporter extends events.EventEmitter {
  constructor (options, defaults) {
    super()

    this.defaults = defaults || {}
    this.options = options || {}

    Reporter.instance = this
    events.EventEmitter.call(this)

    // since `reporter` instance will be used for other extensions,
    // it will quickly reach the limit of `10` listeners,
    // we increase the limit to Infinity for now,
    // later we should probably design
    // a way to detect possible memory leaks from extensions
    this.setMaxListeners(Infinity)

    requestContextMetaConfigCollection.set(this, {})
    extraPathsToCleanupCollection.set(this, [])

    this.initializeListeners = new ListenerCollection()
    this.beforeRenderListeners = new ListenerCollection()
    this.afterRenderListeners = new ListenerCollection()
    this.renderErrorListeners = new ListenerCollection()
    this.afterTemplatingEnginesExecutedListeners = new ListenerCollection()
    this.validateRenderListeners = new ListenerCollection()
    this.closeListeners = new ListenerCollection()
    this.Request = Request
    this.version = require('../package.json').version
    this.settings = new Settings()
    this.extensionsManager = ExtensionsManager(this)

    this.optionsValidator = new SchemaValidator({
      rootSchema: getRootOptionsSchema()
    })

    this.entityTypeValidator = new SchemaValidator()
    this._initWinston()
    this._fnAfterConfigLoaded = () => {}
  }

  async extensionsLoad (opts) {
    const userSuppliedOptions = await this._initOptions()

    if (this.options.logger && this.options.logger.silent === true) {
      this.silentLogs(this.logger)
    }

    this.logger.info('Initializing jsreport@' + this.version + ' in ' + this.options.mode + ' mode' +
      ((this.options.loadConfig ? (' using configuration file: ' + (this._appliedConfigFile || 'none')) : '')))

    if (this.options.connectionString != null) {
      this.logger.warn('jsreport v1 configuration schema detected, please check "https://jsreport.net/blog/jsreport-v2-released" for update instructions')
    }

    await this.extensionsManager.load(opts)

    const newRootSchema = extendRootOptionsSchema(
      getRootOptionsSchema(),
      this.extensionsManager.availableExtensions.map(ex => ({
        name: ex.name,
        schema: ex.optionsSchema
      }))
    )

    this.optionsValidator.setRootSchema(newRootSchema)

    const rootOptionsValidation = this.optionsValidator.validateRoot(this.options, {
      rootPrefix: 'rootOptions',
      // extensions was validated already in extensions load
      ignore: ['properties.extensions']
    })

    if (!rootOptionsValidation.valid) {
      throw new Error(`options contain values that does not match the defined full root schema. ${rootOptionsValidation.fullErrorMessage}`)
    }

    if (userSuppliedOptions.templatingEngines && userSuppliedOptions.templatingEngines.timeout != null && this.options.reportTimeout != null) {
      this.logger.warn(`"templatingEngines.timeout" configuration is ignored when "reportTimeout" is set`)
    } else if (userSuppliedOptions.templatingEngines && userSuppliedOptions.templatingEngines.timeout != null) {
      this.logger.warn(`"templatingEngines.timeout" configuration is deprecated and will be removed in the future, please use "reportTimeout" instead`)
    }

    return this
  }

  /**
 * Required async method to be called before rendering.
 *
 * @return {Promise} initialization is done, promise value is Reporter instance for chaining
 * @public
 */
  async init () {
    if (this._initialized || this._initializing) {
      return Promise.reject(new Error('jsreport already initialized or just initializing. Make sure init is called only once'))
    }

    this._initializing = true

    if (this.compilation) {
      this.compilation.resource('sandbox.js', require.resolve('vm2/lib/sandbox.js'))
      this.compilation.resource('contextify.js', require.resolve('vm2/lib/contextify.js'))
    }

    try {
      await this.extensionsLoad()

      if (this.options.templatingEngines.strategy === DEFAULT_TASK_STRATEGY) {
        this.logger.info(`Setting ${this.options.templatingEngines.strategy} (process based) strategy for rendering. Please visit http://jsreport.net/learn/configuration for information how to get more performance.`)
      } else {
        this.logger.info(`Setting ${this.options.templatingEngines.strategy} strategy for rendering`)
      }

      if (!this.options.templatingEngines.safeSandboxPath) {
        this.options.templatingEngines.safeSandboxPath = path.join(__dirname, 'render/safeSandbox.js')
      }

      this.scriptManager = this.options.templatingEngines.scriptManager || ScriptManager(this.options.templatingEngines)

      Promise.promisifyAll(this.scriptManager)

      this.encryption = encryption(this)

      this.documentStore = DocumentStore(Object.assign({}, this.options, { logger: this.logger }), this.entityTypeValidator, this.encryption)
      this.blobStorage = BlobStorage(this.options)

      this.documentStore.registerEntityType('TemplateType', {
        content: { type: 'Edm.String', document: { extension: 'html', engine: true } },
        recipe: { type: 'Edm.String' },
        // helper accepts both string, and an object when using in-process
        helpers: { type: 'Edm.String', document: { extension: 'js' }, schema: { type: 'object' } },
        engine: { type: 'Edm.String' }
      }, true)

      this.folders = folders(this)

      this.settings.registerEntity(this.documentStore)

      this.addRequestContextMetaConfig('id', { sandboxReadOnly: true })
      this.addRequestContextMetaConfig('reportCounter', { sandboxReadOnly: true })
      this.addRequestContextMetaConfig('startTimestamp', { sandboxReadOnly: true })
      this.addRequestContextMetaConfig('timeoutLimit', { sandboxReadOnly: true })
      this.addRequestContextMetaConfig('logs', { sandboxReadOnly: true })
      this.addRequestContextMetaConfig('isChildRequest', { sandboxReadOnly: true })
      this.addRequestContextMetaConfig('originalInputDataIsEmpty', { sandboxReadOnly: true })
      this.addRequestContextMetaConfig('skipModificationDateUpdate', { sandboxHidden: true })

      await this.scriptManager.ensureStartedAsync()

      this.options.blobStorage = this.options.blobStorage || {}

      if (!this.options.blobStorage.provider || this.options.blobStorage.provider === 'memory') {
        this.blobStorage.registerProvider(require('./blobStorage/inMemoryBlobStorageProvider.js')(this.options))
      }

      if (this.options.blobStorage.provider === 'fs') {
        this.blobStorage.registerProvider(require('./blobStorage/fileSystemBlobStorageProvider.js')(this.options))
      }

      this.initializeListeners.add('core', () => {
        this.afterRenderListeners.add('core', (request) => {
          this.logger.info(`Rendering request ${request.context.id} finished in ${(new Date().getTime() - request.context.startTimestamp)} ms`, request)
        })

        this.renderErrorListeners.add('core', (request, response, error) => {
          const logFn = error.weak ? this.logger.warn : this.logger.error
          logFn(`Rendering request ${request.context.id} finished with error in ${(new Date().getTime() - request.context.startTimestamp)} ms`, request)
        })
      })

      await this.extensionsManager.init()

      if (this.options.reportTimeout != null) {
        this.logger.info(`Using general timeout for rendering (reportTimeout: ${this.options.reportTimeout})`)
      }

      if (this.options.store.provider === 'memory') {
        this.logger.info(`Using ${this.options.store.provider} provider for template store. The saved templates will be lost after restart`)
      } else {
        this.logger.info(`Using ${this.options.store.provider} provider for template store.`)
      }

      await this.documentStore.init()
      await this.blobStorage.init()
      await this.settings.init(this.documentStore, this.authorization)

      // adding the validation of humanReadableKey after extensions has been loaded
      setupValidateId(this)
      setupValidateHumanReadableKey(this)

      await this.initializeListeners.fire()

      await this._startReaper(this.getPathsToWatchForAutoCleanup())

      this.extensionsManager.recipes.push({
        name: 'html',
        execute: htmlRecipe
      })

      this.extensionsManager.engines.push({
        name: 'none',
        pathToEngine: path.join(__dirname, 'render', 'noneEngine.js')
      })

      this.logger.info('reporter initialized')
      this._initialized = true
      return this
    } catch (e) {
      this.logger.error('Error occured during reporter init ' + e.stack)
      throw e
    }
  }

  /**
 * Manual registration of the extension. Once calling `use` the auto discovery of extensions is turned off if not explicitly
 * turned on.
 * jsreport.use(require('jsreport-jsrender')())
 * @param {Object || Function} extensions
 * @return {Reporter} for chaining
 * @public
 */
  use (extension) {
    this.extensionsManager.use(extension)
    return this
  }

  discover () {
    this.options.discover = true
    return this
  }

  createListenerCollection () {
    return new ListenerCollection()
  }

  async checkValidEntityName (c, doc, req) {
    const publicKey = this.documentStore.model.entitySets[c].entityTypePublicKey

    if (!publicKey) {
      return
    }

    checkEntityName(doc[publicKey])

    await validateDuplicatedName(this, c, doc, undefined, req)

    await validateReservedName(this, c, doc)
  }

  /**
 * Main method for invoking rendering
 * render({ template: { content: 'foo', engine: 'none', recipe: 'html' }, data: { foo: 'hello' } })
 *
 * @request {Object}
 * @return {Promise} response.content is output buffer, response.stream is output stream, response.headers contains http applicable headers
 *
 * @public
 */
  render (request, parentRequest) {
    if (!this._initialized) {
      throw new Error('Not initialized, you need to call jsreport.init().then before rendering')
    }
    return render(this, request, parentRequest)
  }

  /**
   *
   * @public
   */
  createError (message, options = {}) {
    return createOrExtendError(message, options)
  }

  getAvailableRenderTimeout (req, defaultValue) {
    return getAvailableRenderTimeoutFn(this, req, defaultValue)
  }

  /**
   * Execute a script using scriptManager
   */
  async executeScript (inputs, options, req) {
    return executeScriptFn(this, inputs, options, req)
  }

  /**
 * Initialize configuration options. This includes loading config files or initializing default config values
 *
 * @private
 */
  async _initOptions () {
    let loadConfig = this.defaults.loadConfig

    if (this.options.loadConfig != null) {
      loadConfig = this.options.loadConfig
    }

    if (loadConfig == null) {
      loadConfig = getDefaultLoadConfig()
    }

    let loadedOptions

    if (loadConfig) {
      loadedOptions = await this._loadConfig()
    } else {
      loadedOptions = await this._loadConfig(false)
    }

    this.options.loadConfig = loadConfig

    // validating initial options at very first to ensure basic options are right
    // this makes afterConfigLoaded function be able to see sanitized values and let us
    // apply defaults later doing checks that expects the right value type
    const rootOptionsValidation = this.optionsValidator.validateRoot(this.options, {
      rootPrefix: 'rootOptions',
      ignore: getRootOptionsSchema.ignoreInitial
    })

    if (!rootOptionsValidation.valid) {
      throw new Error(`options contain values that does not match the defined base root schema. ${rootOptionsValidation.fullErrorMessage}`)
    }

    this.options.appDirectory = this.options.appDirectory || appRoot.toString()
    this.options.parentModuleDirectory = this.options.parentModuleDirectory || path.dirname(module.parent.filename)
    this.options.extensions = this.options.extensions || {}
    this.options.logger = this.options.logger || {}

    await this._fnAfterConfigLoaded(this)

    if (this.options.tempDirectory && !path.isAbsolute(this.options.tempDirectory)) {
      this.options.tempDirectory = path.join(this.options.rootDirectory, this.options.tempDirectory)
    }

    this.options.tempDirectory = this.options.tempDirectory || getDefaultTempDirectory()
    this.options.tempAutoCleanupDirectory = path.join(this.options.tempDirectory, 'autocleanup')
    this.options.tempCoreDirectory = path.join(this.options.tempDirectory, 'core')
    this.options.store = this.options.store || {provider: 'memory'}
    this.options.templatingEngines = this.options.templatingEngines || {}

    // no limit of data for scripts with http-server strategy
    this.options.templatingEngines.inputRequestLimit = -1
    this.options.templatingEngines.strategy = this.options.templatingEngines.strategy || DEFAULT_TASK_STRATEGY
    this.options.templatingEngines.timeout = this.options.templatingEngines.timeout || 10000

    if (this.options.allowLocalFilesAccess === true) {
      this.options.templatingEngines.allowedModules = '*'
    }

    this.options.templatingEngines.tempDirectory = this.options.tempDirectory
    this.options.templatingEngines.tempCoreDirectory = this.options.tempCoreDirectory
    this.options.templatingEngines.tempAutoCleanupDirectory = this.options.tempAutoCleanupDirectory
    this.options.templatingEngines.nativeModules = this.options.templatingEngines.nativeModules || []
    this.options.templatingEngines.modules = this.options.templatingEngines.modules || []
    this.options.templatingEngines.allowedModules = this.options.templatingEngines.allowedModules || []

    this._configureWinstonTransports(this.options.logger)

    if (!fs.existsSync(this.options.tempDirectory)) {
      mkdirp.sync(this.options.tempDirectory)
    }

    if (!fs.existsSync(this.options.tempAutoCleanupDirectory)) {
      mkdirp.sync(this.options.tempAutoCleanupDirectory)
    }

    if (!fs.existsSync(this.options.tempCoreDirectory)) {
      mkdirp.sync(this.options.tempCoreDirectory)
    }

    return loadedOptions
  }

  /**
 * Hook to alter configuration after it was loaded and merged
 * jsreport.afterConfigLoaded(function(reporter) { .. do your stuff ..})
 *
 *
 * @public
 */
  afterConfigLoaded (fn) {
    this._fnAfterConfigLoaded = fn
    return this
  }

  /**
 *
 * @public
 */
  async close () {
    this.logger.info('Closing jsreport instance')

    if (this.reaperTimerRef) {
      clearInterval(this.reaperTimerRef)
    }

    if (this.scriptManager) {
      this.scriptManager.kill()
    }

    await this.closeListeners.fire()

    if (this.documentStore) {
      await this.documentStore.close()
    }

    this.logger.info('jsreport instance has been closed')

    return this
  }

  /**
 * Merge config values from arguments, environment variables, default passed to the constructor and configuration file
 *
 * @private
 */
  _loadConfig (loadExternal = true) {
    let loadedOptions = {}
    // using clean instance of nconf, avoids sharing values between multiple instances of jsreport
    const nconfInstance = new nconf.Provider()

    let rootDirectory = this.options.rootDirectory || this.defaults.rootDirectory || getDefaultRootDirectory()
    let mode = this.options.mode || getDefaultMode()

    if (this.options.rootDirectory) {
      loadedOptions.rootDirectory = this.options.rootDirectory
    }

    if (this.options.mode) {
      loadedOptions.mode = this.options.mode
    }

    // we use `.defaults({ store: <value> }` because nconf has problems reading objects with `store`
    // property, nconf always take the value of `.store` instead of whole options object in that case
    // so we need to pass our object inside store property in order to be loaded correctly
    let nfn = nconfInstance.overrides({ store: this.options })

    this._appliedConfigFile = null

    const makeTransform = ({ normalize, separator }) => (obj) => {
      let separators = !Array.isArray(separator) ? [separator] : separator

      separators = separators.join('')

      if (normalize === true && obj.key === 'extensions' && typeof obj.value === 'object') {
        Object.keys(obj.value).forEach((extensionKey) => {
          const realExtensionName = decamelize(extensionKey, '-')
          const currentValue = obj.value[extensionKey]
          delete obj.value[extensionKey]

          if (realExtensionName !== extensionKey && obj.value[realExtensionName]) {
            obj.value[realExtensionName] = extend(
              true,
              obj.value[realExtensionName],
              currentValue
            )
          } else {
            obj.value[realExtensionName] = currentValue
          }
        })
      } else if (!normalize && obj.key.startsWith('extensions')) {
        // the transform ensures that camelCase alias keys of extensions
        // are being loaded as decamelized keys, this is needed
        // in order to respect the order of configuration loading
        // for args and env config values
        const match = new RegExp(`extensions[${separators}](.[^${separators}]*)[${separators}]*.*`).exec(obj.key)

        if (!match) {
          return obj
        }

        if (match.length < 2) {
          throw new Error(`Wrong configuration value ${obj.key}`)
        }

        const realExtensionName = decamelize(match[1], '-')
        obj.key = obj.key.replace(match[1], realExtensionName)
      }

      return obj
    }

    if (loadExternal) {
      const separators = ['_', ':']

      nfn = nfn.argv({
        // we make a transform that just normalize keys,
        // because the transform for args receives single key "extensions" with
        // already parsed values of nested args
        // "--extensions.something.value = true", "--extensions.something2.value = true".
        // unlike the transform for env store which receives raw keys
        transform: makeTransform({ normalize: true })
      }).env({
        separator: ':',
        transform: makeTransform({ separator: separators })
      }).env({
        separator: '_',
        transform: makeTransform({ separator: separators })
      })
    }

    if (nfn.get('rootDirectory') != null) {
      rootDirectory = nfn.get('rootDirectory')
    }

    if (nfn.get('mode') != null) {
      mode = nfn.get('mode')
    }

    // the highest priority for applied config file has file specified using configFile option
    const configFileParam = nfn.get('configFile')

    if (configFileParam) {
      const configFilePath = path.isAbsolute(configFileParam) ? configFileParam : path.join(rootDirectory, configFileParam)

      if (!fs.existsSync(configFilePath)) {
        throw new Error('Config file ' + configFileParam + ' was not found.')
      }

      this._appliedConfigFile = configFileParam

      nfn.file({file: configFilePath})

      if (nfn.get('rootDirectory') != null) {
        rootDirectory = nfn.get('rootDirectory')
      }

      if (nfn.get('mode') != null) {
        mode = nfn.get('mode')
      }
    }

    if (loadExternal) {
      // if the configFile was not specified, try to apply config file based on the mode
      if (!this._appliedConfigFile) {
        let envBasedConfigFile = 'dev.config.json'
        if (mode === 'production') {
          envBasedConfigFile = 'prod.config.json'
        }

        if (mode === 'test') {
          envBasedConfigFile = 'test.config.json'
        }

        if (fs.existsSync(path.join(rootDirectory, envBasedConfigFile))) {
          this._appliedConfigFile = envBasedConfigFile
          nfn.file({file: path.join(rootDirectory, envBasedConfigFile)})

          if (nfn.get('rootDirectory') != null) {
            rootDirectory = nfn.get('rootDirectory')
          }

          if (nfn.get('mode') != null) {
            mode = nfn.get('mode')
          }
        }
      }

      // no config file applied so far, lets try to apply the default jsreport.config.json
      if (!this._appliedConfigFile) {
        if (fs.existsSync(path.join(rootDirectory, 'jsreport.config.json'))) {
          this._appliedConfigFile = 'jsreport.config.json'
          nfn.file({file: path.join(rootDirectory, 'jsreport.config.json')})

          if (nfn.get('rootDirectory') != null) {
            rootDirectory = nfn.get('rootDirectory')
          }

          if (nfn.get('mode') != null) {
            mode = nfn.get('mode')
          }
        }
      }
    }

    // we pass a copy of defaults to avoid loosing the original
    // object values
    nfn.defaults({ store: extend(true, {}, this.defaults) })

    this.options = nconfInstance.get()

    loadedOptions = extend(true, {}, this.options, loadedOptions)

    this.options.rootDirectory = rootDirectory
    this.options.mode = mode

    return loadedOptions
  }

  /**
 * Expose winston logger through reporter.logger
 *
 * @private
 */
  _initWinston () {
    if (!winston.loggers.has('jsreport')) {
      const debugTransport = new DebugTransport()

      winston.loggers.add('jsreport', {
        transports: [debugTransport]
      })

      winston.loggers.get('jsreport').emitErrs = true

      winston.loggers.get('jsreport').on('error', function (err) {
        let dir
        let msg

        if (err.code === 'ENOENT') {
          dir = path.dirname(err.path)

          if (dir === '.') {
            msg = 'Error from logger (winston) while trying to use a file to store logs:'
          } else {
            msg = 'Error from logger (winston) while trying to use a file to store logs. If the directory "' + dir + '" does not exist, please create it:'
          }

          // make the error intentionally more visible to get the attention of the user
          console.error('------------------------')
          console.error(msg, err)
          console.error('------------------------')
        }
      })
    } else {
      if (!winston.loggers.get('jsreport').transports.debug) {
        winston.loggers.get('jsreport').add(DebugTransport)
      }
    }

    this.logger = winston.loggers.get('jsreport')
    this.logger.rewriters.push(function (level, msg, meta) {
      // detecting if meta is jsreport request object
      if (meta != null && meta.context) {
        meta.context.logs = meta.context.logs || []

        meta.context.logs.push({
          level: level,
          message: msg,
          timestamp: meta.timestamp || new Date().getTime()
        })

        // excluding non relevant properties for the log
        return Object.assign({}, omit(meta, ['template', 'options', 'data', 'context', 'timestamp']))
      }

      return meta
    })
  }

  /**
 * Configure transports in jsreport logger instance
 *
 * @private
 */
  _configureWinstonTransports (_transports) {
    var transports = _transports || {}

    var knownTransports = {
      debug: DebugTransport,
      memory: winston.transports.Memory,
      console: winston.transports.Console,
      file: winston.transports.File,
      http: winston.transports.Http
    }

    var knownOptions = ['transport', 'module', 'enabled']

    Object.keys(transports).forEach((transpName) => {
      const logger = this.logger
      const transpOptions = transports[transpName]
      let transportModule

      if (!transpOptions || typeof transpOptions !== 'object' || Array.isArray(transpOptions)) {
        return
      }

      if (typeof transpOptions.transport !== 'string' || transpOptions.transport === '') {
        throw new Error(
          'invalid option for transport object "' + transpName +
        '", option "transport" is not specified or has an incorrect value, must be a string with a valid value. check your "logger" config'
        )
      }

      if (typeof transpOptions.level !== 'string' || transpOptions.level === '') {
        throw new Error(
          'invalid option for transport object "' + transpName +
        '", option "level" is not specified or has an incorrect value, must be a string with a valid value. check your "logger" config'
        )
      }

      if (transpOptions.enabled === false) {
        return
      }

      if (knownTransports[transpOptions.transport]) {
        if (!logger.transports[transpName]) {
          logger.add(knownTransports[transpOptions.transport], Object.assign(omit(transpOptions, knownOptions), {
            name: transpName
          }))
        }
      } else {
        if (transpOptions.module == null) {
          throw new Error(
            'invalid option for transport object "' + transpName +
          '", option "transport" has an unknown transport type: "' + transpOptions.transport + '". check your "logger" config'
          )
        }

        if (typeof transpOptions.module !== 'string') {
          throw new Error(
            'invalid option for transport object "' + transpName +
          '", option "module" has an incorrect value, must be a string with a module name. check your "logger" config'
          )
        }

        try {
          transportModule = require(transpOptions.module)

          if (typeof winston.transports[transpOptions.transport] === 'function') {
            transportModule = winston.transports[transpOptions.transport]
          } else if (transportModule && typeof transportModule[transpOptions.transport] === 'function') {
            transportModule = transportModule[transpOptions.transport]
          }

          if (typeof transportModule !== 'function') {
            throw new Error(
              'invalid option for transport object "' + transpName +
            '", module "' + transpOptions.module + '" does not export a valid transport. check your "logger" config'
            )
          }
        } catch (e) {
          if (e.code === 'MODULE_NOT_FOUND') {
            throw new Error(
              'invalid option for transport object "' + transpName +
            '", module "' + transpOptions.module +
            '" in "module" option could not be found. are you sure that you have installed it?. check your "logger" config'
            )
          }

          throw e
        }

        if (!logger.transports[transpName]) {
          logger.add(transportModule, Object.assign(omit(transpOptions, knownOptions), {
            name: transpName
          }))
        }
      }
    })
  }

  /**
   * @public
   */
  addRequestContextMetaConfig (property, options) {
    const requestContextMetaConfig = requestContextMetaConfigCollection.get(this)
    requestContextMetaConfig[property] = options
  }

  /**
   * @public
   */
  getRequestContextMetaConfig (property) {
    const requestContextMetaConfig = requestContextMetaConfigCollection.get(this)

    if (property === undefined) {
      return requestContextMetaConfig
    }

    return requestContextMetaConfig[property]
  }

  /**
   * @public
   */
  addPathToWatchForAutoCleanup (customPath) {
    const pathsToCleanupConfig = extraPathsToCleanupCollection.get(this)

    if (pathsToCleanupConfig.indexOf(customPath) === -1) {
      pathsToCleanupConfig.push(customPath)
    }
  }

  /**
   * @public
   */
  getPathsToWatchForAutoCleanup () {
    const pathsToCleanupConfig = extraPathsToCleanupCollection.get(this)

    return [this.options.tempAutoCleanupDirectory].concat(pathsToCleanupConfig)
  }

  /**
   * Ensures that the jsreport autocleanup temp directory (options.tempAutoCleanupDirectory) exists by doing a mkdir call
   *
   * @public
   */
  async ensureTempDirectoryExists () {
    if (this.options.tempAutoCleanupDirectory == null) {
      throw new Error('Can not use ensureTempDirectoryExists when tempAutoCleanupDirectory option is not initialized, make sure to initialize jsreport first using jsreport.init()')
    }

    return tempFilesHandler.ensureTempDirectoryExists(this.options.tempAutoCleanupDirectory)
  }

  /**
   * Reads a file from the jsreport autocleanup temp directory (options.tempAutoCleanupDirectory)
   *
   * @public
   */
  async readTempFile (filename, opts) {
    if (this.options.tempAutoCleanupDirectory == null) {
      throw new Error('Can not use readTempFile when tempAutoCleanupDirectory option is not initialized, make sure to initialize jsreport first using jsreport.init()')
    }

    return tempFilesHandler.readTempFile(this.options.tempAutoCleanupDirectory, filename, opts)
  }

  /**
   * Creates a file into the jsreport autocleanup temp directory (options.tempAutoCleanupDirectory)
   * ensuring that the directory always exists
   *
   * @public
   */
  async writeTempFile (filenameFn, content, opts) {
    if (this.options.tempAutoCleanupDirectory == null) {
      throw new Error('Can not use writeTempFile when tempAutoCleanupDirectory option is not initialized, make sure to initialize jsreport first using jsreport.init()')
    }

    return tempFilesHandler.writeTempFile(this.options.tempAutoCleanupDirectory, filenameFn, content, opts)
  }

  /**
   * Reads a file as stream from the jsreport autocleanup temp directory (options.tempAutoCleanupDirectory)
   *
   * @public
   */
  async readTempFileStream (filename, opts) {
    if (this.options.tempAutoCleanupDirectory == null) {
      throw new Error('Can not use readTempFileStream when tempAutoCleanupDirectory option is not initialized, make sure to initialize jsreport first using jsreport.init()')
    }

    return tempFilesHandler.readTempFileStream(this.options.tempAutoCleanupDirectory, filename)
  }

  /**
   * Creates a file as stream into the jsreport autocleanup temp directory (options.tempAutoCleanupDirectory)
   * ensuring that the directory always exists
   *
   * @public
   */
  async writeTempFileStream (filenameFn, opts) {
    if (this.options.tempAutoCleanupDirectory == null) {
      throw new Error('Can not use writeTempFileStream when tempAutoCleanupDirectory option is not initialized, make sure to initialize jsreport first using jsreport.init()')
    }

    return tempFilesHandler.writeTempFileStream(this.options.tempAutoCleanupDirectory, filenameFn, opts)
  }

  /**
 * Periodical cleaning of folders where recipes are storing files like source html for pdf rendering
 *
 * @private
 */
  _startReaper (dir) {
    const dirsToWatch = !Array.isArray(dir) ? [dir] : dir

    if (this.options.autoTempCleanup === false) {
      return
    }

    // 3 minutes old files will be deleted
    const reaper = new Reaper({threshold: 180000})

    dirsToWatch.forEach(d => reaper.watch(d))

    reaper.start((err, files) => {
      if (err) {
        this.logger.error('Failed to start auto cleanup: ' + err)
      }
    })

    this.reaperTimerRef = setInterval(() => {
      try {
        reaper.start((err, files) => {
          if (err) {
            // NOT logging the error anymore because it was confusing users that something bad was happening
            // this.logger.error('Failed to delete temp file: ' + err)
          }
        })
      } catch (e) {
        // NOT logging the error anymore because it was confusing users that something bad was happening
        // catch error in case the reaper can not read directory
        // this.logger.error('Failed to run reaper: ' + e)
      }
    }, 30000 /* check every 30s for old files */)

    this.reaperTimerRef.unref()
  }

  silentLogs (logger) {
    if (logger.transports) {
      Object.keys(logger.transports).forEach((transportName) => {
      // this is the recommended way to modify transports in runtime, as per winston's docs
        logger.transports[transportName].silent = true
      })
    }
  }
}
