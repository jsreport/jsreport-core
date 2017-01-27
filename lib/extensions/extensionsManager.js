/*!
 * Copyright(c) 2016 Jan Blaha
 *
 * ExtensionsManager responsible for loading and  registering jsreport extensions.
 */

var events = require('events')
var util = require('util')
var path = require('path')
var Promise = require('bluebird')
var extend = require('node.extend')
var discover = require('./discover')
var sorter = require('./sorter')
var os = require('os')

var ExtensionsManager = module.exports = function (reporter) {
  var self = this
  events.EventEmitter.call(this)

  this.availableExtensions = []
  this.recipes = []
  this.engines = []
  this.reporter = reporter
  this.usedExtensions = []

  Object.defineProperty(this, 'extensions', {
    get: function () {
      return self.availableExtensions.filter(function (e) {
        return !e.options || e.options.enabled !== false
      })
    }
  })
}

util.inherits(ExtensionsManager, events.EventEmitter)

ExtensionsManager.prototype.init = function () {
  var self = this
  this.availableExtensions = []

  return Promise.resolve().then(function () {
    if (self.reporter.options.discover || (self.reporter.options.discover !== false && self.usedExtensions.length === 0)) {
      return discover({
        logger: self.reporter.logger,
        rootDirectory: self.reporter.options.rootDirectory,
        mode: self.reporter.options.mode,
        cacheAvailableExtensions: self.reporter.options.cacheAvailableExtensions,
        tempDirectory: self.reporter.options.tempDirectory,
        extensionsLocationCache: self.reporter.options.extensionsLocationCache
      }).then(function (extensions) {
        self.reporter.logger.debug('Discovered ' + extensions.length + ' extensions')
        self.availableExtensions = self.availableExtensions.concat(extensions)
      })
    }
  }).then(function () {
    self.availableExtensions = self.availableExtensions.concat(self.usedExtensions)

    if (self.reporter.options.extensions) {
      self.availableExtensions = self.availableExtensions.filter(function (e) {
        return self.reporter.options.extensions.indexOf(e.name) !== -1
      })
    }

    self.availableExtensions.sort(sorter)
  }).then(function () {
    return self._useMany(self.availableExtensions)
  })
}

ExtensionsManager.prototype.use = function (extension) {
  if (typeof extension === 'function') {
    this.usedExtensions.push({
      main: extension,
      directory: this.reporter.options.parentModuleDirectory,
      dependencies: []
    })
    return
  }

  if (typeof extension === 'object') {
    this.usedExtensions.push(extension)
    return
  }

  throw new Error('use accepts function or object')
}

ExtensionsManager.prototype._useMany = function (extensions) {
  var self = this

  var promise = Promise.resolve()
  var promises = extensions.map(function (e) {
    return (promise = promise.then(function () {
      return self._useOne(e).catch(function (err) {
        self.reporter.logger.error('Error when loading extension ' + err + os.EOL + err.stack)
      })
    }))
  })

  return Promise.all(promises)
}

ExtensionsManager.prototype._useOne = function (extension) {
  var self = this

  try {
    extension.options = extend(true, extension.options || {}, this.reporter.options[extension.name])

    if (extension.options.enabled === false) {
      self.reporter.logger.debug('Extension ' + extension.name + ' is disabled, skipping')
      return Promise.resolve()
    }

    self.reporter.logger.info('Using extension ' + extension.name || 'inline')

    return Promise.resolve().then(function () {
      if (typeof extension.main === 'function') {
        return extension.main.call(self, self.reporter, extension)
      }

      if (extension.directory && extension.main) {
        return require(path.join(extension.directory, extension.main)).call(self, self.reporter, extension)
      }
    }).then(function () {
      if (extension.options.enabled !== false) {
        self.emit('extension-registered', extension)
      } else {
        self.reporter.logger.debug('Extension ' + extension.name + ' was disabled')
      }
    })
  } catch (e) {
    this.reporter.logger.error('Error when loading extension ' + extension.name + os.EOL + e.stack)
    return Promise.resolve()
  }
}
