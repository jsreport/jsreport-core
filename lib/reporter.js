/*!
 * Copyright(c) 2014 Jan Blaha
 *
 * Reporter main class responsible for rendering process.
 */

var events = require('events')
var util = require('util')
var _ = require('underscore')
var path = require('path')
var toner = require('toner')
var DocumentStore = require('./store/documentStore.js')
var q = require('q')
var os = require('os')
var fs = require('fs')
var Settings = require('./util/settings.js')
var ExtensionsManager = require('./extensionsManager.js')
var ListenerCollection = require('listener-collection')
var Reaper = require('reap')
var mkdirp = require('mkdirp')
var winston = require('winston')
var nconf = require('nconf')
var ConsoleLogger = require('./util/consoleLogger')

var reportCounter = 0

function Reporter (options) {
  this.options = options || {}
  Reporter.instance = this
  events.EventEmitter.call(this)

  this.initializeListener = new ListenerCollection()
  this.beforeRenderListeners = new ListenerCollection()
  this.afterRenderListeners = new ListenerCollection()
  this.afterTemplatingEnginesExecutedListeners = new ListenerCollection()
  this.validateRenderListeners = new ListenerCollection()
  this.version = require(path.join(__dirname, '../', 'package.json')).version
  this.settings = new Settings()
  this.extensionsManager = new ExtensionsManager(this)
  q.longStackSupport = true
  this.logger = new ConsoleLogger()
  this._fnAfterConfigLoaded = function () {
  }
}

util.inherits(Reporter, events.EventEmitter)

Reporter.prototype.init = function () {
  var self = this

  return this._initOptions().then(function () {
    self.toner = toner(self.options.tasks)
    self.scriptManager = self.toner.scriptManager
    self.documentStore = new DocumentStore(self.options)
    self._bindTonerListeners()
  }).then(function () {
    return self._init()
  }).then(function () {
    self.emit('before-init')
    return self.initializeListener.fire().then(function () {
      self.extensionsManager.recipes.push({
        name: 'html',
        execute: function (request, response) {
          return q.nfcall(toner.htmlRecipe, request, response)
        }
      })

      self.extensionsManager.engines.push({
        name: 'none',
        pathToEngine: toner.noneEngine
      })
      self._useRecipesInToner()
      self._useEnginesInToner()
      self.logger.info('reporter initialized')
      return self
    })
  }).fail(function (e) {
    self.logger.error('Error occured during reporter init ' + e.stack)
    return q.reject(e)
  })
}

Reporter.prototype.use = function (extension) {
  this.options.discover = false
  this.extensionsManager.use(extension)
}

Reporter.prototype._init = function () {
  var self = this

  this.settings.registerEntity(this.documentStore)

  return q.ninvoke(this.toner.scriptManager, 'ensureStarted').then(function () {
    return self.extensionsManager.init()
  }).then(function () {
    return self._startReaper()
  }).then(function () {
    return self.documentStore.init()
  }).then(function () {
    if (!self.options.blobStorage || self.options.blobStorage === 'inMemory') {
      self.blobStorage = new (require('./blobStorage/inMemoryBlobStorage.js'))(self.options)
    }
    if (self.options.blobStorage === 'fileSystem') {
      self.blobStorage = new (require('./blobStorage/fileSystemBlobStorage.js'))(self.options)
    }
  }).then(function () {
    return self.settings.init(self.documentStore)
  }).fail(function (e) {
    self.logger.error('Error occured during reporter init ' + e.stack)
    return q.reject(e)
  })
}

Reporter.prototype.createListenerCollection = function () {
  return new ListenerCollection()
}

Reporter.prototype._bindTonerListeners = function () {
  function toCb (promise, cb) {
    q.when(promise).then(function () {
      cb()
    }).catch(function (e) {
      cb(e)
    })
  }

  var self = this
  this.toner.before(function (req, res, cb) {
    var prom = self.beforeRenderListeners.fire(req, res).then(function () {
      return self.validateRenderListeners.fire(req, res)
    })

    toCb(prom, cb)
  })
  this.toner.after(function (req, res, cb) {
    toCb(self.afterRenderListeners.fire(req, res), cb)
  })
  this.toner.afterEngine(function (req, res, cb) {
    toCb(self.afterTemplatingEnginesExecutedListeners.fire(req, res), cb)
  })
}

Reporter.prototype._useRecipesInToner = function () {
  var self = this
  this.extensionsManager.recipes.forEach(function (recipe) {
    self.toner.recipe(recipe.name, function (req, res, cb) {
      q.when(recipe.execute(req, res)).then(function () {
        cb()
      }).catch(function (e) {
        cb(e)
      })
    })
  })
}

Reporter.prototype._useEnginesInToner = function () {
  var self = this

  this.extensionsManager.engines.forEach(function (engine) {
    self.toner.engine(engine.name, engine.pathToEngine)
  })
}

Reporter.prototype.render = function (request) {
  if (!request.template) {
    return q.reject(new Error('template property must be defined.'))
  }

  request.reportCounter = ++reportCounter
  request.startTime = new Date()
  this.logger.info('Starting rendering request ' + reportCounter + ' (user: ' + (request.user ? request.user.username : 'null') + ')')
  var self = this

  request.options = request.options || {}

  request.reporter = self

  if (_.isString(request.data)) {
    try {
      request.data = JSON.parse(request.data.toString())
    } catch (e) {
    }
  }

  return q.ninvoke(this.toner, 'render', request).then(function (response) {
    self.logger.info('Rendering request ' + request.reportCounter + ' finished in ' + (new Date() - request.startTime) + ' ms')
    response.result = response.stream
    return response
  }).catch(function (e) {
    e.message = 'Error during rendering report: ' + e.message
    var logFn = e.weak ? self.logger.warn : self.logger.error
    logFn('Error when processing render request ' + e.message + ' ' + e.stack)
    throw e
  })
}

Reporter.prototype._initOptions = function () {
  var self = this

  this.options.rootDirectory = this.options.rootDirectory || path.join(__dirname, '../../../')

  return q().then(function () {
    if (self.options.loadConfig) {
      return self._loadConfig()
    }
  }).then(function () {
    return self._fnAfterConfigLoaded(self)
  }).then(function () {
    return self._initLogger()
  }).then(function () {
    self.options.tenant = self.options.tenant || {name: ''}
    self.options.dataDirectory = self.options.dataDirectory || path.join(self.options.rootDirectory, 'data')
    self.options.tempDirectory = self.options.tempDirectory || path.join(os.tmpdir(), 'jsreport-temp')
    self.options.connectionString = self.options.connectionString || {name: 'memory'}
    self.options.phantom = self.options.phantom || {}
    self.options.tasks = self.options.tasks || {}
    self.options.discover = self.options.discover == null ? true : self.options.discover

    if (!self.options.phantom.strategy && !self.options.tasks.strategy) {
      self.logger.info('Setting process based strategy for rendering. Please visit http://jsreport.net/learn/configuration for information how to get more performance.')
    }

    self.options.phantom.strategy = self.options.phantom.strategy || 'dedicated-process'
    self.options.tasks.strategy = self.options.tasks.strategy || 'dedicated-process'

    self.options.tasks.tempDirectory = self.options.tempDirectory
    self.options.tasks.nativeModules = [{globalVariableName: '_', module: 'underscore'}, {
      globalVariableName: 'moment',
      module: 'moment'
    }]
  })
}

Reporter.prototype.afterConfigLoaded = function (fn) {
  this._fnAfterConfigLoaded = fn
  return this
}

Reporter.prototype._loadConfig = function () {
  this.options.mode = process.env.NODE_ENV || 'production'
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

  var nfn = nconf.argv().env().defaults(this.options)

  if (fs.existsSync(path.join(this.options.rootDirectory, getConfigFile()))) {
    nfn = nfn.file({file: path.join(this.options.rootDirectory, getConfigFile())})
  }

  this.options = nconf.get()
}

Reporter.prototype._initLogger = function () {
  this.options.logger = this.options.logger || {}
  this.options.logger.providerName = this.options.logger.providerName || 'development'

  switch (this.options.logger.providerName) {
    case 'dummy':
      this.logger = new (require('./util/dummyLogger'))()
      break
    case 'development':
      this.logger = new (require('./util/developmentLogger'))()
      break
    case 'console':
      this.logger = new (require('./util/consoleLogger'))()
      break
    case 'winston':
      this.logger = this._initWinstonLogger()
      break
  }

  this.options.logger = this.logger
}

Reporter.prototype._initWinstonLogger = function () {
  if (!winston.loggers.has('jsreport')) {
    var transportSettings = {
      timestamp: true,
      colorize: true,
      level: this.options.mode === 'production' ? 'info' : 'debug'
    }

    var logDirectory = this.options.logger.logDirectory || path.join(this.options.rootDirectory, 'logs')

    if (fs.existsSync(logDirectory)) {
      mkdirp.sync(logDirectory)
    }
    var consoleTransport = new (winston.transports.Console)(transportSettings)
    var fileTransport = new (winston.transports.File)({
      name: 'main',
      filename: path.join(logDirectory, 'reporter.log'),
      maxsize: 10485760,
      json: false,
      level: transportSettings.level
    })
    var errorFileTransport = new (winston.transports.File)({
      name: 'error',
      level: 'error',
      filename: path.join(logDirectory, 'error.log'),
      handleExceptions: true,
      json: false
    })

    winston.loggers.add('jsreport', {
      transports: [consoleTransport, fileTransport, errorFileTransport]
    })
  }

  return winston.loggers.get('jsreport')
}

var reaperGlobalInterval
Reporter.prototype._startReaper = function () {
  // 3 minutes old files will be deleted
  var reaper = new Reaper({threshold: 180000})
  var self = this

  if (fs.existsSync(this.options.tempDirectory)) {
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
  }, 30000 /* check every 30s for old files */)
}

module.exports = Reporter
