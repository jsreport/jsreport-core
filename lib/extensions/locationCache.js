const Promise = require('bluebird')
const path = require('path')
const utils = require('../util/util')
const mkdirp = Promise.promisify(require('mkdirp'))
const fs = Promise.promisifyAll(require('fs'))

module.exports = (config) => {
  const pathToLocationCache = path.join(config.tempCoreDirectory, 'locations.json')

  return {
    async get () {
      if (config.mode === 'jsreport-development' || config.useExtensionsLocationCache === false) {
        config.logger.info('Skipping extensions location cache when NODE_ENV=jsreport-development or when option useExtensionsLocationCache === false, crawling now')

        return utils.walkSync(config.rootDirectory, 'jsreport.config.js')
      }

      try {
        await fs.statAsync(pathToLocationCache)
      } catch (e) {
        config.logger.info('Extensions location cache not found, crawling directories')
        return utils.walkSync(config.rootDirectory, 'jsreport.config.js')
      }

      const content = await fs.readFileAsync(pathToLocationCache, 'utf8')

      let cache

      try {
        cache = JSON.parse(content)[path.join(__dirname, '../../../')]
      } catch (e) {
        // file is corrupted, nevermind and crawl the extensions
      }

      if (!cache) {
        config.logger.info('Extensions location cache doesn\'t contain entry yet, crawling')
        return utils.walkSync(config.rootDirectory, 'jsreport.config.js')
      }

      const stat = await fs.statAsync(path.join(__dirname, '../../../'))
      if (stat.mtime.getTime() > cache.lastSync) {
        config.logger.info('Extensions location cache ' + pathToLocationCache + ' contains older information, crawling')
        return utils.walkSync(config.rootDirectory, 'jsreport.config.js')
      }

      await Promise.all(cache.locations.map((l) => fs.statAsync(l)))
      config.logger.info('Extensions location cache contains up to date information, skipping crawling in ' + config.rootDirectory)
      var directories = utils.walkSync(config.rootDirectory, 'jsreport.config.js', path.join(__dirname, '../../../'))
      var result = directories.concat(cache.locations)

      return result
    },

    async save (extensions) {
      const directories = extensions
        .map((e) => path.join(e.directory, 'jsreport.config.js'))
        .filter((d) => d.indexOf(path.join(__dirname, '../../../')) !== -1)

      await mkdirp(config.tempCoreDirectory)
      try {
        await fs.statAsync(pathToLocationCache)
      } catch (e) {
        await fs.writeFileAsync(pathToLocationCache, JSON.stringify({}), 'utf8')
      }

      const content = await fs.readFileAsync(pathToLocationCache, 'utf8')
      let nodes = {}

      try {
        nodes = JSON.parse(content)
      } catch (e) {
        // file is corrupted, nevermind and override all
      }

      nodes[path.join(__dirname, '../../../')] = {
        locations: directories,
        lastSync: new Date().getTime()
      }

      config.logger.debug('Writing extension locations cache to ' + pathToLocationCache)
      return fs.writeFileAsync(pathToLocationCache, JSON.stringify(nodes), 'utf8')
    }
  }
}
