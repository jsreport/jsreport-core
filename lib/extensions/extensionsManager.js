/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * ExtensionsManager responsible for loading and  registering jsreport extensions.
 */

const path = require('path')
const extend = require('node.extend')
const discover = require('./discover')
const sorter = require('./sorter')
const os = require('os')

module.exports = (reporter) => {
  return {
    availableExtensions: [],
    recipes: [],
    engines: [],
    usedExtensions: [],
    get extensions () {
      return this.availableExtensions.filter((e) => !e.options || e.options.enabled !== false)
    },

    async init () {
      this.availableExtensions = []

      if (reporter.options.discover || (reporter.options.discover !== false && this.usedExtensions.length === 0)) {
        const extensions = await discover({
          logger: reporter.logger,
          rootDirectory: reporter.options.rootDirectory,
          mode: reporter.options.mode,
          cacheAvailableExtensions: reporter.options.cacheAvailableExtensions,
          tempCoreDirectory: reporter.options.tempCoreDirectory,
          extensionsLocationCache: reporter.options.extensionsLocationCache
        })

        reporter.logger.debug('Discovered ' + extensions.length + ' extensions')
        this.availableExtensions = this.availableExtensions.concat(extensions)
      }

      this.availableExtensions = this.availableExtensions.concat(this.usedExtensions)

      if (reporter.options.extensionsList) {
        this.availableExtensions = this.availableExtensions.filter((e) => reporter.options.extensionsList.indexOf(e.name) !== -1)
      }

      this.availableExtensions.sort(sorter)

      return this._useMany(this.availableExtensions)
    },

    use (extension) {
      if (typeof extension === 'function') {
        this.usedExtensions.push({
          main: extension,
          directory: reporter.options.parentModuleDirectory,
          dependencies: []
        })
        return
      }

      if (typeof extension === 'object') {
        this.usedExtensions.push(extension)
        return
      }

      throw new Error('use accepts function or object')
    },

    async _useMany (extensions) {
      for (const e of extensions) {
        await this._useOne(e)
      }
    },

    async _useOne (extension) {
      try {
        extension.options = extend(true, {}, extension.options || {}, reporter.options.extensions[extension.name])

        if (extension.options.enabled === false) {
          reporter.logger.debug('Extension ' + extension.name + ' is disabled, skipping')
          return
        }

        reporter.logger.info('Using extension ' + (extension.name || 'inline'))

        if (extension.optionsSchema != null) {
          try {
            reporter.optionsValidator.addSchema(extension.name, extension.optionsSchema)
          } catch (e) {
            throw new Error(`optionsSchema in definition does not contain a valid json schema. ${e.message}`)
          }

          const optionsValidationResult = reporter.optionsValidator.validate(extension.name, extension.options)

          if (!optionsValidationResult.valid) {
            throw new Error(formatExtensionOptionsError(extension.name, optionsValidationResult.fullErrorMessage))
          }

          const availableExtensionIndex = this.availableExtensions.indexOf(extension)
          const usedExtensionIndex = this.usedExtensions.indexOf(extension)

          extension = new Proxy(extension, {
            set: (obj, prop, value, receiver) => {
              let newValue

              if (prop === 'options') {
                const newData = extend(true, {}, value)
                const result = reporter.optionsValidator.validate(extension.name, newData)

                if (!result.valid) {
                  throw new Error(formatExtensionOptionsError(extension.name, result.fullErrorMessage))
                }

                newValue = newData
              } else {
                newValue = value
              }

              return Reflect.set(obj, prop, newValue, receiver)
            }
          })

          // ensure extension references in availableExtensions, usedExtensions have
          // the proxy instance also
          if (availableExtensionIndex !== -1) {
            this.availableExtensions[availableExtensionIndex] = extension
          }

          if (usedExtensionIndex !== -1) {
            this.usedExtensions[usedExtensionIndex] = extension
          }
        }

        if (typeof extension.main === 'function') {
          await extension.main.call(this, reporter, extension)
        } else {
          if (extension.directory && extension.main) {
            await require(path.join(extension.directory, extension.main)).call(this, reporter, extension)
          }
        }

        if (extension.options.enabled === false) {
          reporter.logger.debug('Extension ' + extension.name + ' was disabled')
        }
      } catch (e) {
        reporter.logger.error('Error when loading extension ' + extension.name + os.EOL + e.stack)
        throw new Error('Error when loading extension ' + extension.name + os.EOL + e.stack)
      }
    }
  }
}

function formatExtensionOptionsError (extName, fullErrorMessage) {
  return `options of extension ${extName} contain values that does not match the defined schema. ${fullErrorMessage}`
}
