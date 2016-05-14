/*!
 * Copyright(c) 2016 Jan Blaha
 *
 * ExtensionsManager responsible for loading and  registering jsreport extensions.
 */

var events = require('events')
var util = require('util')
var utils = require('./util/util.js')
var path = require('path')
var _ = require('underscore')
var mkdirp = require('mkdirp')
var q = require('q')
var fs = require('fs')
var extend = require('node.extend')

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
      if (self.usedExtensions.length) {
        return self.usedExtensions
      }
      return self.availableExtensions.filter(function (e) {
        return e.isRegistered
      })
    }
  })
}

util.inherits(ExtensionsManager, events.EventEmitter)

ExtensionsManager.prototype.init = function () {
  this.pathToLocationCache = path.join(this.reporter.options.tempDirectory, 'extensions', 'locations.json')
  if (this.reporter.options.discover) {
    return this._discover()
  }

  var self = this
  this.usedExtensions.forEach(function (e) {
    e.options = extend(true, e.options || {}, self.reporter.options[e.name])
    e.main(self.reporter, e)
  })

  return q()
}

ExtensionsManager.prototype._discover = function () {
  var self = this
  return this._findAvailableExtensions().then(function (extensions) {
    extensions.forEach(function (e) {
      e.options = self.reporter.options[e.name] || {}
    })
    self.availableExtensions = extensions

    var extensionsToRegister = self.reporter.options.extensions ? self.reporter.options.extensions.slice(0) : _.map(extensions, function (e) {
      return e.name
    })

    return self._use(extensionsToRegister).then(function () {
      self._removeDuplications()
      self.reporter.logger.info('Extensions loaded.')
      return self._saveDiscoveredExtensionsToCache()
    })
  })
}

ExtensionsManager.prototype._saveDiscoveredExtensionsToCache = function () {
  var directories = this.availableExtensions.map(function (e) {
    return path.join(e.directory, 'jsreport.config.js')
  }).filter(function (d) {
    return d.indexOf(path.join(__dirname, '../../')) !== -1
  })

  var self = this

  return q.nfcall(mkdirp, path.join(this.reporter.options.tempDirectory, 'extensions')).then(function () {
    return q.nfcall(fs.stat, self.pathToLocationCache).catch(function () {
      return q.nfcall(fs.writeFile, self.pathToLocationCache, JSON.stringify({}), 'utf8')
    })
  }).then(function () {
    return q.nfcall(fs.readFile, self.pathToLocationCache, 'utf8').then(function (content) {
      var nodes = JSON.parse(content)

      nodes[path.join(__dirname, '../../')] = {
        locations: directories,
        lastSync: new Date().getTime()
      }

      self.reporter.logger.debug('Writing extension locations cache to ' + self.pathToLocationCache)
      return q.nfcall(fs.writeFile, self.pathToLocationCache, JSON.stringify(nodes), 'utf8')
    })
  })
}

ExtensionsManager.prototype._getExtensionDirectories = function (pathToSearch) {
  var self = this

  if (this.reporter.options.mode !== 'production') {
    self.reporter.logger.debug('Skipping extensions cache in non production environment, crawling')
    return q().then(function () {
      return utils.walkSync(pathToSearch, 'jsreport.config.js')
    })
  }

  return q.nfcall(fs.stat, this.pathToLocationCache)
    .then(function () {
      return q.nfcall(fs.readFile, self.pathToLocationCache, 'utf8')
        .then(function (content) {
          var cache = JSON.parse(content)[path.join(__dirname, '../../')]

          if (!cache) {
            self.reporter.logger.debug('Extensions location cache doesn\'t contain entry yet, crawling')
            return utils.walkSync(pathToSearch, 'jsreport.config.js')
          }

          return q.nfcall(fs.stat, path.join(__dirname, '../../')).then(function (stat) {
            if (stat.mtime.getTime() > cache.lastSync) {
              self.reporter.logger.debug('Extensions location cache contains older information, crawling')
              return utils.walkSync(pathToSearch, 'jsreport.config.js')
            }

            self.reporter.logger.debug('Extensions location cache contains up to date information, skipping crawling in ' + path.join(__dirname, '../../'))
            var directories = utils.walkSync(pathToSearch, 'jsreport.config.js', path.join(__dirname, '../../'))
            var result = directories.concat(cache.locations)

            return result
          })
        })
    }).catch(function (e) {
      self.reporter.logger.debug('Extensions location cache not found, crawling directories')
      return utils.walkSync(pathToSearch, 'jsreport.config.js')
    })
}

ExtensionsManager.prototype._useInternal = function (extension) {
  var self = this

  try {
    var extensionDefinition = _.findWhere(this.availableExtensions, {name: extension})

    if (!extensionDefinition) {
      this.reporter.logger.warn('Extension ' + extension + ' was not found.')
      return q()
    }

    if (extensionDefinition.skipInExeRender && this.reporter.options.render) {
      return q()
    }

    self.reporter.logger.info('Using extension ' + extension)

    if (!extensionDefinition) {
      throw new Error('Extension not found in folder ' + this.reporter.options.rootDirectory)
    }

    return q().then(function () {
      return require(path.join(extensionDefinition.directory, extensionDefinition.main)).call(self, self.reporter, extensionDefinition)
    }).then(function () {
      extensionDefinition.isRegistered = true
      self.emit('extension-registered', extensionDefinition)
    })
  } catch (e) {
    this.reporter.logger.error('Error when loading extension ' + extension + require('os').EOL + e.stack)
    return q()
  }
}

ExtensionsManager.prototype.use = function (extension) {
  extension.isRegistered = true
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
        self.reporter.logger.error('Error when loading extension ' + err + require('os').EOL + err.stack)
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
  var pathToSearch = this.reporter.options.rootDirectory
  this.reporter.logger.info('Searching for available extensions in ' + pathToSearch)

  if (this.reporter.options.cacheAvailableExtensions && _availableExtensionsCache) {
    this.reporter.logger.info('Loading extensions from cache ' + _availableExtensionsCache.length)
    return q(_availableExtensionsCache)
  }

  var self = this

  return this._getExtensionDirectories(pathToSearch).then(function (results) {
    results = results.filter(function (r) {
      return r
    })
    self.reporter.logger.info('Found ' + results.length + ' extensions')
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
