/*!
 * Copyright(c) 2014 Jan Blaha
 *
 * ExtensionsManager responsible for loading, registering and unregistering jsreport extensions.
 */

var events = require('events')
var util = require('util')
var utils = require('./util/util.js')
var path = require('path')
var _ = require('underscore')
var q = require('q')
var extend = require('node.extend')

var ExtensionsManager = module.exports = function (reporter, settings, logger, options) {
  var self = this
  events.EventEmitter.call(this)

  this.availableExtensions = []
  this.recipes = []
  this.engines = []
  this.reporter = reporter
  this.options = options
  this.settings = settings
  this.logger = logger
  this.usedExtensions = []
  this.discover = true

  Object.defineProperty(this, 'extensions', {
    get: function () {
      return self.availableExtensions.filter(function (e) {
        return e.isRegistered
      })
    }
  })
}

util.inherits(ExtensionsManager, events.EventEmitter)

ExtensionsManager.prototype.init = function () {
  if (this.discover) {
    return this._discover()
  }

  var self = this
  this.usedExtensions.forEach(function (e) {
    e.options = extend(true, e.options || {}, self.options[e.name])
    e.main(self.reporter, e)
  })

  return q()
}

ExtensionsManager.prototype._discover = function () {
  var self = this
  return this._findAvailableExtensions().then(function (extensions) {
    extensions.forEach(function (e) {
      e.options = self.options[e.name] || {}
    })
    self.availableExtensions = extensions

    var extensionsToRegister = self.options.extensions ? self.options.extensions.slice(0) : _.map(extensions, function (e) {
      return e.name
    })

    return self._use(extensionsToRegister).then(function () {
      self._removeDuplications()
      self.logger.info('Extensions loaded.')
    })
  })
}

ExtensionsManager.prototype._useInternal = function (extension) {
  var self = this

  try {
    var extensionDefinition = _.findWhere(this.availableExtensions, {name: extension})

    if (extensionDefinition.skipInExeRender && this.options.render) {
      return q()
    }

    self.logger.info('Using extension ' + extension)

    if (!extensionDefinition) {
      throw new Error('Extension not found in folder ' + this.options.rootDirectory)
    }

    return q().then(function () {
      return require(path.join(extensionDefinition.directory, extensionDefinition.main)).call(self, self.reporter, extensionDefinition)
    }).then(function () {
      extensionDefinition.isRegistered = true
      self.emit('extension-registered', extensionDefinition)
    })
  } catch (e) {
    this.logger.error('Error when loading extension ' + extension + require('os').EOL + e.stack)
    return q()
  }
}

ExtensionsManager.prototype.use = function (extension) {
  this.usedExtensions.push(extension)
}

ExtensionsManager.prototype._use = function (extension) {
  var self = this

  if (_.isString(extension)) {
    extension = [extension]
  }

  if (!_.isArray(extension)) {
    extension = [extension]
  }

  var promise = q()
  var promises = extension.filter(function (e) {
    return e !== ''
  }).map(function (e) {
    return (promise = promise.then(function () {
      return self._useInternal(e).catch(function (err) {
        self.logger.error('Error when loading extension ' + err + require('os').EOL + err.stack)
      })
    }))
  })

  return q.all(promises)
}

ExtensionsManager.prototype._removeDuplications = function () {
  this.engines = _.uniq(this.engines, function (item, key, a) {
    return item.name
  })
}

var _availableExtensionsCache
ExtensionsManager.prototype._findAvailableExtensions = function () {
  var pathToSearch = this.options.rootDirectory
  this.logger.info('Searching for available extensions in ' + pathToSearch)

  if (this.options.cacheAvailableExtensions && _availableExtensionsCache) {
    this.logger.info('Loading extensions from cache ' + _availableExtensionsCache.length)
    return q(_availableExtensionsCache)
  }

  var self = this

  return q().then(function () {
    var results = utils.walkSync(pathToSearch, 'jsreport.config.js')

    results = results.filter(function (r) {
      return r
    })
    self.logger.info('Found ' + results.length + ' extensions')
    var availableExtensions = results.map(function (configFile) {
      return _.extend({directory: path.dirname(configFile)}, require(configFile))
    }).sort(function (pa, pb) {
      // todo, sort better by dependencies
      pa.dependencies = pa.dependencies || []
      pb.dependencies = pb.dependencies || []

      if (pa.dependencies.length > pb.dependencies.length) return 1
      if (pa.dependencies.length < pb.dependencies.length) return -1

      return 0
    })

    _availableExtensionsCache = availableExtensions
    return availableExtensions
  })
}
