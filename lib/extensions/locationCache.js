var Promise = require('bluebird')
var path = require('path')
var utils = require('../util/util')
var mkdirp = Promise.promisify(require('mkdirp'))
var fs = Promise.promisifyAll(require('fs'))

var pathToLocationCache

module.exports.get = function (config) {
  pathToLocationCache = path.join(config.tempDirectory, 'extensions', 'locations.json')

  if (config.mode === 'jsreport-development' || config.extensionsLocationCache === false) {
    config.logger.info('Skipping extensions location cache when NODE_ENV=jsreport-development or when option extensionsLocationCache === false, crawling now')

    return Promise.resolve().then(function () {
      return utils.walkSync(config.rootDirectory, 'jsreport.config.js')
    })
  }

  return fs.statAsync(pathToLocationCache)
    .then(function () {
      return fs.readFileAsync(pathToLocationCache, 'utf8')
        .then(function (content) {
          var cache = JSON.parse(content)[path.join(__dirname, '../../../')]

          if (!cache) {
            config.logger.info('Extensions location cache doesn\'t contain entry yet, crawling')
            return utils.walkSync(config.rootDirectory, 'jsreport.config.js')
          }

          return fs.statAsync(path.join(__dirname, '../../../')).then(function (stat) {
            if (stat.mtime.getTime() > cache.lastSync) {
              config.logger.info('Extensions location cache ' + pathToLocationCache + ' contains older information, crawling')
              return utils.walkSync(config.rootDirectory, 'jsreport.config.js')
            }

            return Promise.all(cache.locations.map(function (l) {
              return fs.statAsync(l)
            })).then(function () {
              config.logger.info('Extensions location cache contains up to date information, skipping crawling in ' + path.join(__dirname, '../../../'))
              var directories = utils.walkSync(config.rootDirectory, 'jsreport.config.js', path.join(__dirname, '../../../'))
              var result = directories.concat(cache.locations)

              return result
            })
          })
        })
    }).catch(function (e) {
      config.logger.info('Extensions location cache not found, crawling directories')
      return utils.walkSync(config.rootDirectory, 'jsreport.config.js')
    })
}

module.exports.save = function (extensions, config) {
  var directories = extensions.map(function (e) {
    return path.join(e.directory, 'jsreport.config.js')
  }).filter(function (d) {
    return d.indexOf(path.join(__dirname, '../../../')) !== -1
  })

  return mkdirp(path.join(config.tempDirectory, 'extensions')).then(function () {
    return fs.statAsync(pathToLocationCache).catch(function () {
      return fs.writeFileAsync(pathToLocationCache, JSON.stringify({}), 'utf8')
    })
  }).then(function () {
    return fs.readFileAsync(pathToLocationCache, 'utf8').then(function (content) {
      var nodes = {}
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
    })
  })
}
