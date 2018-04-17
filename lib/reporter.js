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
const os = require('os')
const fs = require('fs')
const Settings = require('./util/settings.js')
const SchemaValidator = require('./util/schemaValidator')
const ExtensionsManager = require('./extensions/extensionsManager.js')
const ListenerCollection = require('listener-collection')
const Reaper = require('reap2')
const mkdirp = require('mkdirp')
const winston = require('winston')
const nconf = require('nconf')
const ScriptManager = require('script-manager')
const checkEntityName = require('./util/validateEntityName')
const DebugTransport = require('./util/debugTransport')
const render = require('./render/render')
const htmlRecipe = require('./render/htmlRecipe')
const appRoot = require('app-root-path')
const omit = require('lodash.omit')
const DEFAULT_TASK_STRATEGY = 'dedicated-process'

const requestContextMetaConfigCollection = new WeakMap()

module.exports = class Reporter extends events.EventEmitter {
  constructor (options) {
    super()
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

    this.initializeListeners = new ListenerCollection()
    this.beforeRenderListeners = new ListenerCollection()
    this.afterRenderListeners = new ListenerCollection()
    this.renderErrorListeners = new ListenerCollection()
    this.afterTemplatingEnginesExecutedListeners = new ListenerCollection()
    this.validateRenderListeners = new ListenerCollection()
    this.closeListeners = new ListenerCollection()
    this.version = require('../package.json').version
    this.settings = new Settings()
    this.extensionsManager = ExtensionsManager(this)
    this.optionsValidator = new SchemaValidator()
    this.entityTypeValidator = new SchemaValidator()
    this._initWinston()
    this._fnAfterConfigLoaded = () => {}
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

    try {
      await this._initOptions()
      if (this.options.logger && this.options.logger.silent === true) {
        this.silentLogs(this.logger)
      }

      this.logger.info('Initializing jsreport@' + this.version + ' in ' + this.options.mode + ' mode' +
        ((this.options.loadConfig ? (' using configuration file: ' + (this._appliedConfigFile || 'none')) : '')))

      if (this.options.templatingEngines.strategy === DEFAULT_TASK_STRATEGY) {
        this.logger.info('Setting process based strategy for rendering. Please visit http://jsreport.net/learn/configuration for information how to get more performance.')
      }

      if (!this.options.templatingEngines.safeSandboxPath) {
        this.options.templatingEngines.safeSandboxPath = path.join(__dirname, 'render/safeSandbox.js')
      }

      this.scriptManager = this.options.templatingEngines.scriptManager || ScriptManager(this.options.templatingEngines)
      Promise.promisifyAll(this.scriptManager)

      this.documentStore = DocumentStore(Object.assign({}, this.options, { logger: this.logger }), this.entityTypeValidator)
      this.blobStorage = BlobStorage(this.options)

      this.documentStore.registerEntityType('TemplateType', {
        content: { type: 'Edm.String', document: { extension: 'html', engine: true } },
        recipe: { type: 'Edm.String' },
        helpers: { type: 'Edm.String', document: { extension: 'js' } },
        engine: { type: 'Edm.String' }
      }, true)

      this.settings.registerEntity(this.documentStore)

      await this.scriptManager.ensureStartedAsync()
      this.options.blobStorage = this.options.blobStorage || {}
      if (!this.options.blobStorage.provider || this.options.blobStorage.provider === 'memory') {
        this.blobStorage.registerProvider(require('./blobStorage/inMemoryBlobStorageProvider.js')(this.options))
      }
      if (this.options.blobStorage.provider === 'fs') {
        this.blobStorage.registerProvider(require('./blobStorage/fileSystemBlobStorageProvider.js')(this.options))
      }
      await this.extensionsManager.init()
      await this._startReaper(this.options.tempAutoCleanupDirectory)
      await this.documentStore.init()
      await this.blobStorage.init()
      await this.settings.init(this.documentStore)
      await this.initializeListeners.fire()
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

  validateEntityName (name) {
    // in case of invalid name the method will throw an error
    return checkEntityName(name)
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
   * Execute a script using scriptManager
   */
  executeScript (inputs, options, req) {
    return this.scriptManager.executeAsync(inputs, options)
  }

  /**
 * Initialize configuration options. This includes loading config files or initializing default confiv values
 *
 * @private
 */
  async _initOptions () {
    this.options.rootDirectory = this.options.rootDirectory || path.join(__dirname, '../../../')
    this.options.appDirectory = this.options.appDirectory || appRoot.toString()
    this.options.parentModuleDirectory = this.options.parentModuleDirectory || path.dirname(module.parent.filename)
    this.options.extensions = this.options.extensions || {}

    this.options.mode = process.env.JSREPORT_ENV || process.env.NODE_ENV || 'development'
    this.options.logger = this.options.logger || {}

    if (this.options.loadConfig) {
      await this._loadConfig()
    }

    await this._fnAfterConfigLoaded(this)

    if (this.options.tempDirectory && !path.isAbsolute(this.options.tempDirectory)) {
      this.options.tempDirectory = path.join(this.options.rootDirectory, this.options.tempDirectory)
    }
    this.options.tempDirectory = this.options.tempDirectory || path.join(os.tmpdir(), 'jsreport')
    this.options.tempAutoCleanupDirectory = path.join(this.options.tempDirectory, 'autocleanup')
    this.options.tempCoreDirectory = path.join(this.options.tempDirectory, 'core')
    this.options.store = this.options.store || {provider: 'memory'}
    this.options.templatingEngines = this.options.templatingEngines || {}

    this.options.templatingEngines.strategy = this.options.templatingEngines.strategy || DEFAULT_TASK_STRATEGY

    if (this.options.renderingSource === 'trusted') {
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
    this.scriptManager.kill()
    await this.closeListeners.fire()
    this.logger.info('jsreport instance has been closed')
    return this
  }

  /**
 * Merge config values from arguments, environment variables, default passed to the constructor and configuration file
 *
 * @private
 */
  _loadConfig () {
    const nfn = nconf.argv().env({ separator: ':' }).env({ separator: '_' }).defaults(this.options)
    this._appliedConfigFile = null

    // the highest priority for applied config file has file specified using configFile option
    const configFileParam = nfn.get('configFile')
    if (configFileParam) {
      const configFilePath = path.isAbsolute(configFileParam) ? configFileParam : path.join(this.options.rootDirectory, configFileParam)

      if (!fs.existsSync(configFilePath)) {
        throw new Error('Config file ' + configFileParam + ' was not found.')
      }

      this._appliedConfigFile = configFileParam
      nfn.file({file: configFilePath})
    }

    // if the configFile was not specified, try to apply confic file based on the mode
    if (!this._appliedConfigFile) {
      let envBasedConfigFile = 'dev.config.json'
      if (this.options.mode === 'production') {
        envBasedConfigFile = 'prod.config.json'
      }

      if (this.options.mode === 'test') {
        envBasedConfigFile = 'test.config.json'
      }

      if (fs.existsSync(path.join(this.options.rootDirectory, envBasedConfigFile))) {
        this._appliedConfigFile = envBasedConfigFile
        nfn.file({file: path.join(this.options.rootDirectory, envBasedConfigFile)})
      }
    }

    // no config file applied so far, lets try to apply the default jsreport.config.json
    if (!this._appliedConfigFile) {
      if (fs.existsSync(path.join(this.options.rootDirectory, 'jsreport.config.json'))) {
        this._appliedConfigFile = 'jsreport.config.json'
        nfn.file({file: path.join(this.options.rootDirectory, 'jsreport.config.json')})
      }
    }

    this.options = nconf.get()
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
        logger.add(knownTransports[transpOptions.transport], Object.assign(omit(transpOptions, knownOptions), {
          name: transpName
        }))
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

        logger.add(transportModule, Object.assign(omit(transpOptions, knownOptions), {
          name: transpName
        }))
      }
    })
  }

  addRequestContextMetaConfig (property, options) {
    const requestContextMetaConfig = requestContextMetaConfigCollection.get(this)
    requestContextMetaConfig[property] = options
  }

  getRequestContextMetaConfig (property) {
    const requestContextMetaConfig = requestContextMetaConfigCollection.get(this)

    if (property === undefined) {
      return requestContextMetaConfig
    }

    return requestContextMetaConfig[property]
  }

  /**
 * Periodical cleaning of temp folder where recipes are storing files like source html for pdf rendering
 *
 * @private
 */
  _startReaper (dir) {
    if (this.options.autoTempCleanup === false) {
      return
    }

    // 3 minutes old files will be deleted
    const reaper = new Reaper({threshold: 180000})

    reaper.watch(dir)

    reaper.start((err, files) => {
      if (err) {
        this.logger.error('Failed to start auto cleanup: ' + err)
      }
    })

    setInterval(() => {
      reaper.start((err, files) => {
        if (err) {
          this.logger.error('Failed to delete temp file: ' + err)
        }
      })
    }, 30000 /* check every 30s for old files */).unref()
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
