/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * ExtensionsManager responsible for loading and  registering jsreport extensions.
 */

const events = require('events')
const util = require('util')
const path = require('path')
const extend = require('node.extend')
const discover = require('./discover')
const sorter = require('./sorter')
const os = require('os')

const ExtensionsManager = module.exports = function (reporter) {
  events.EventEmitter.call(this)

  this.availableExtensions = []
  this.recipes = []
  this.engines = []
  this.reporter = reporter
  this.usedExtensions = []

  Object.defineProperty(this, 'extensions', {
    get: () => this.availableExtensions.filter((e) => !e.options || e.options.enabled !== false)
  })
}

util.inherits(ExtensionsManager, events.EventEmitter)

ExtensionsManager.prototype.init = async function () {
  this.availableExtensions = []

  if (this.reporter.options.discover || (this.reporter.options.discover !== false && this.usedExtensions.length === 0)) {
    const extensions = await discover({
      logger: this.reporter.logger,
      rootDirectory: this.reporter.options.rootDirectory,
      mode: this.reporter.options.mode,
      cacheAvailableExtensions: this.reporter.options.cacheAvailableExtensions,
      tempCoreDirectory: this.reporter.options.tempCoreDirectory,
      extensionsLocationCache: this.reporter.options.extensionsLocationCache
    })

    this.reporter.logger.debug('Discovered ' + extensions.length + ' extensions')
    this.availableExtensions = this.availableExtensions.concat(extensions)
  }

  this.availableExtensions = this.availableExtensions.concat(this.usedExtensions)

  if (this.reporter.options.extensions) {
    this.availableExtensions = this.availableExtensions.filter((e) => this.reporter.options.extensions.indexOf(e.name) !== -1)
  }

  this.availableExtensions.sort(sorter)

  return this._useMany(this.availableExtensions)
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

ExtensionsManager.prototype._useMany = async function (extensions) {
  for (const e of extensions) {
    try {
      await this._useOne(e)
    } catch (err) {
      this.reporter.logger.error('Error when loading extension ' + err + os.EOL + err.stack)
    }
  }
}

ExtensionsManager.prototype._useOne = async function (extension) {
  try {
    extension.options = extend(true, extension.options || {}, this.reporter.options[extension.name])

    if (extension.options.enabled === false) {
      this.reporter.logger.debug('Extension ' + extension.name + ' is disabled, skipping')
      return
    }

    this.reporter.logger.info('Using extension ' + (extension.name || 'inline'))

    if (typeof extension.main === 'function') {
      await extension.main.call(this, this.reporter, extension)
    }

    if (extension.directory && extension.main) {
      await require(path.join(extension.directory, extension.main)).call(this, this.reporter, extension)
    }

    if (extension.options.enabled !== false) {
      this.emit('extension-registered', extension)
    } else {
      this.reporter.logger.debug('Extension ' + extension.name + ' was disabled')
    }
  } catch (e) {
    this.reporter.logger.error('Error when loading extension ' + extension.name + os.EOL + e.stack)
  }
}
