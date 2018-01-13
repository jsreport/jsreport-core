const path = require('path')
const locationCache = require('./locationCache')

let _availableExtensionsCache

module.exports = async (config) => {
  const cache = locationCache(config)

  config.logger.info('Searching for available extensions in ' + config.rootDirectory)

  if (config.cacheAvailableExtensions && _availableExtensionsCache) {
    config.logger.info('Loading extensions from cache ' + _availableExtensionsCache.length)
    return _availableExtensionsCache
  }

  const results = await cache.get()
  config.logger.info('Found ' + results.length + ' extensions')

  const availableExtensions = results.map((configFile) => Object.assign({ directory: path.dirname(configFile) }, require(configFile)))

  _availableExtensionsCache = availableExtensions
  await cache.save(availableExtensions)
  return availableExtensions
}
