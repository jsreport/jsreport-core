/*!
 * Copyright(c) 2014 Jan Blaha
 *
 * Reporter main class including all methods jsreport-core exposes.
 */

var events = require('events')
var util = require('util')
var path = require('path')
var DocumentStore = require('./store/documentStore.js')
var Promise = require('bluebird')
var os = require('os')
var fs = require('fs')
var extend = require('node.extend')
var Settings = require('./util/settings.js')
var ExtensionsManager = require('./extensions/extensionsManager.js')
var ListenerCollection = require('listener-collection')
var Reaper = require('reap')
var mkdirp = require('mkdirp')
var winston = require('winston')
var nconf = require('nconf')
var ScriptManager = require('script-manager')
var DebugTransport = require('./util/debugTransport')
var render = require('./render/render')
var htmlRecipe = require('./render/htmlRecipe')
var appRoot = require('app-root-path')
var DEFAULT_TASK_STRATEGY = 'dedicated-process'

function Reporter (options) {
  this.options = options || {}
  Reporter.instance = this
  events.EventEmitter.call(this)

  // since `reporter` instance will be used for other extensions,
  // it will quickly reach the limit of `10` listeners,
  // we increase the limit to Infinity for now,
  // later we should probably design
  // a way to detect possible memory leaks from extensions
  this.setMaxListeners(Infinity)

  this.initializeListeners = new ListenerCollection()
  this.beforeRenderListeners = new ListenerCollection()
  this.afterRenderListeners = new ListenerCollection()
  this.renderErrorListeners = new ListenerCollection()
  this.afterTemplatingEnginesExecutedListeners = new ListenerCollection()
  this.validateRenderListeners = new ListenerCollection()
  this.version = require('../package.json').version
  this.settings = new Settings()
  this.extensionsManager = new ExtensionsManager(this)
  this._initWinston()
  this._fnAfterConfigLoaded = function () {
  }

  var self = this
  Object.defineProperty(this, 'initializeListener', {
    get: function () {
      if (self.logger) {
        self.logger.warn('initializeListener is deprecated, use initializeListeners instead')
      }

      return self.initializeListeners
    }
  })
}

util.inherits(Reporter, events.EventEmitter)

/**
 * Required async method to be called before rendering.
 *
 * @return {Promise} initialization is done, promise value is Reporter instance for chaining
 * @public
 */
Reporter.prototype.init = function () {
  var self = this

  return this._initOptions().then(function () {
    if (self.options.logger && self.options.logger.silent) {
      silentLogs(self.logger)
    }

    self.logger.info('Initializing jsreport@' + self.version + ' in ' + self.options.mode + ' mode' + ((self.options.loadConfig ? (' using configuration file ' + self.options.configFile) : '')))

    if (self.options.tasks.strategy === DEFAULT_TASK_STRATEGY) {
      self.logger.info('Setting process based strategy for rendering. Please visit http://jsreport.net/learn/configuration for information how to get more performance.')
    }

    self.scriptManager = self.options.tasks.scriptManager || ScriptManager(self.options.tasks)
    self.documentStore = new DocumentStore(extend({}, self.options, { logger: self.logger }))

    self.settings.registerEntity(self.documentStore)

    var ensureStarted = Promise.promisify(self.scriptManager.ensureStarted).bind(self.scriptManager)

    return ensureStarted().then(function () {
      if (!self.options.blobStorage || self.options.blobStorage === 'inMemory') {
        self.blobStorage = new (require('./blobStorage/inMemoryBlobStorage.js'))(self.options)
      }
      if (self.options.blobStorage === 'fileSystem') {
        self.blobStorage = new (require('./blobStorage/fileSystemBlobStorage.js'))(self.options)
      }
    }).then(function () {
      return self.extensionsManager.init()
    }).then(function () {
      return self._startReaper()
    }).then(function () {
      return self.documentStore.init()
    }).then(function () {
      return self.settings.init(self.documentStore)
    }).then(function () {
      self._promisifyBlobStorage()
      return self.initializeListeners.fire().then(function () {
        self.extensionsManager.recipes.push({
          name: 'html',
          execute: htmlRecipe
        })

        self.extensionsManager.engines.push({
          name: 'none',
          pathToEngine: path.join(__dirname, 'render', 'noneEngine.js')
        })

        self.logger.info('reporter initialized')
        self._initialized = true
        return self
      })
    })
  }).catch(function (e) {
    self.logger.error('Error occured during reporter init ' + e.stack)
    return Promise.reject(e)
  })
}

/**
 * Manual registration of the extension. Once calling `use` the auto discovery of extensions is turned off if not explicitly
 * turned on.
 * jsreport.use(require('jsreport-jsrender')())
 * @param {Object || Function} extensions
 * @return {Reporter} for chaining
 * @public
 */
Reporter.prototype.use = function (extension) {
  this.extensionsManager.use(extension)
  return this
}

Reporter.prototype.discover = function () {
  this.options.discover = true
  return this
}

Reporter.prototype.createListenerCollection = function () {
  return new ListenerCollection()
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
Reporter.prototype.render = function (request) {
  if (!this._initialized) {
    throw new Error('Not initialized, you need to call jsreport.init().then before rendering')
  }
  return render(this, request)
}

/**
 * Initialize configuration options. This includes loading config files or initializing default confiv values
 *
 * @private
 */
Reporter.prototype._initOptions = function () {
  var self = this

  this.options.rootDirectory = this.options.rootDirectory || path.join(__dirname, '../../../')
  this.options.appDirectory = this.options.appDirectory || appRoot.toString()
  this.options.parentModuleDirectory = this.options.parentModuleDirectory || path.dirname(module.parent.filename)

  this.options.mode = process.env.NODE_ENV || 'development'
  this.options.logger = this.options.logger || {}

  if (this.options.logger.silent == null) {
    this.options.logger.silent = false
  }

  return Promise.resolve().then(function () {
    if (self.options.loadConfig) {
      return self._loadConfig()
    }
  }).then(function () {
    return self._fnAfterConfigLoaded(self)
  }).then(function () {
    self.options.tenant = self.options.tenant || {name: ''}
    self.options.dataDirectory = self.options.dataDirectory || path.join(self.options.rootDirectory, 'data')
    self.options.tempDirectory = self.options.tempDirectory || path.join(os.tmpdir(), 'jsreport-temp')
    self.options.connectionString = self.options.connectionString || {name: 'memory'}
    self.options.tasks = self.options.tasks || {}

    self.options.tasks.strategy = self.options.tasks.strategy || DEFAULT_TASK_STRATEGY

    self.options.tasks.tempDirectory = self.options.tempDirectory
    self.options.tasks.nativeModules = self.options.tasks.nativeModules || []
    self.options.tasks.modules = self.options.tasks.modules || []
    self.options.tasks.allowedModules = self.options.tasks.allowedModules || []
  })
}

/**
 * Hook to alter configuration after it was loaded and merged
 * jsreport.afterConfigLoaded(function(config) { .. do your stuff ..})
 *
 *
 * @public
 */
Reporter.prototype.afterConfigLoaded = function (fn) {
  this._fnAfterConfigLoaded = fn
  return this
}

/**
 * Merge config values from arguments, environment variables, default passed to the constructor and configuration file
 *
 * @private
 */
Reporter.prototype._loadConfig = function () {
  var self = this

  function getConfigFile () {
    if (self.options.mode === 'production') {
      return 'prod.config.json'
    }

    if (self.options.mode === 'test') {
      return 'test.config.json'
    }

    return 'dev.config.json'
  }

  var nfn = nconf.argv().env({ separator: ':' }).env({ separator: '_' }).defaults(this.options)

  this.options.configFile = getConfigFile()

  if (fs.existsSync(path.join(this.options.rootDirectory, this.options.configFile))) {
    nfn.file({file: path.join(this.options.rootDirectory, this.options.configFile)})
  }

  this.options = nconf.get()
}

/**
 * Expose winston logger through reporter.logger
 *
 * @private
 */
Reporter.prototype._initWinston = function () {
  if (!winston.loggers.has('jsreport')) {
    var debugTransport = new DebugTransport()

    winston.loggers.add('jsreport', {
      transports: [debugTransport]
    })
  }

  this.logger = winston.loggers.get('jsreport')
}

/**
 * Promisify blobStorage read/write methods if the last argument is callback function
 * due to back compatibility
 *
 * @private
 */
Reporter.prototype._promisifyBlobStorage = function () {
  var self = this

  if (typeof this.blobStorage.write === 'function' && this.blobStorage.write.length === 3) {
    var originalWrite = this.blobStorage.write

    this.blobStorage.write = function (blobName, buffer, request, response) {
      return new Promise(function (resolve, reject) {
        return originalWrite.call(self.blobStorage, blobName, buffer, function (err, val) {
          if (err) {
            return reject(err)
          }

          return resolve(val)
        })
      })
    }
  }

  if (typeof this.blobStorage.read === 'function' && this.blobStorage.read.length === 2) {
    var originalRead = this.blobStorage.read

    this.blobStorage.read = function (blobName, request, response) {
      return new Promise(function (resolve, reject) {
        return originalRead.call(self.blobStorage, blobName, function (err, val) {
          if (err) {
            return reject(err)
          }

          return resolve(val)
        })
      })
    }
  }

  if (typeof this.blobStorage.remove === 'function' && this.blobStorage.remove.length === 2) {
    var originalRemove = this.blobStorage.remove

    this.blobStorage.remove = function (blobName, request, response) {
      return new Promise(function (resolve, reject) {
        return originalRemove.call(self.blobStorage, blobName, function (err, val) {
          if (err) {
            return reject(err)
          }

          return resolve(val)
        })
      })
    }
  }
}

var reaperGlobalInterval
/**
 * Periodical cleaning of temp folder where recipes are storing files like source html for pdf rendering
 *
 * @private
 */
Reporter.prototype._startReaper = function () {
  if (this.options.autoTempCleanup === false) {
    return
  }

  // 3 minutes old files will be deleted
  var reaper = new Reaper({threshold: 180000})
  var self = this

  if (!fs.existsSync(this.options.tempDirectory)) {
    mkdirp.sync(this.options.tempDirectory)
  }

  reaper.watch(this.options.tempDirectory)

  if (reaperGlobalInterval) {
    clearInterval(reaperGlobalInterval)
  }

  reaper.start(function (err, files) {
    if (err) {
      self.logger.error(err)
    }
  })

  setInterval(function () {
    reaper.start(function (err, files) {
      if (err) {
        self.logger.error(err)
      }
    })
  }, 30000 /* check every 30s for old files */).unref()
}

function silentLogs (logger) {
  if (logger.transports) {
    Object.keys(logger.transports).forEach(function (transportName) {
      // this is the recommended way to modify transports in runtime, as per winston's docs
      logger.transports[transportName].silent = true
    })
  }
}

module.exports = Reporter
