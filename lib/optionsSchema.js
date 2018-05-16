
const { getDefaultTempDirectory, getDefaultLoadConfig } = require('./defaults')

module.exports = () => ({
  type: 'object',
  properties: {
    rootDirectory: {
      type: 'string',
      description: 'specifies where is the application root and where jsreport searches for extensions'
    },
    appDirectory: {
      type: 'string',
      description: 'specifies directory of the script that was used to start node.js, this value is mostly metadata that is useful for your own code inside jsreport scripts'
    },
    tempDirectory: {
      type: 'string',
      default: getDefaultTempDirectory(),
      description: 'specifies where jsreport stores temporary files used by the conversion pipeline'
    },
    loadConfig: {
      type: 'boolean',
      default: getDefaultLoadConfig(),
      description: 'specifies if jsreport should load configuration values from external sources (cli args, env vars, configuration files) or not'
    },
    autoTempCleanup: {
      type: 'boolean',
      default: true,
      description: 'specifies if after some interval jsreport should automatically clean up temporary files generated while rendering reports'
    },
    discover: {
      type: 'boolean',
      defaultNotInitialized: true,
      description: 'specifies if jsreport should discover/search installed extensions in project and use them automatically'
    },
    useExtensionsLocationCache: {
      type: 'boolean',
      default: true,
      description: 'wheter if jsreport should read list of extensions from a previous generated cache or if it should crawl and try to search extensions again, set it to false when you want to always force crawling node_modules when searching for extensions while starting jsreport'
    },
    logger: {
      type: 'object',
      properties: {
        silent: { type: 'boolean' }
      }
    },
    allowLocalFilesAccess: { type: 'boolean', default: false },
    templatingEngines: {
      type: 'object',
      properties: {
        strategy: { type: 'string', enum: ['in-process', 'dedicated-process', 'http-server'] },
        numberOfWorkers: { type: 'number' },
        allowedModules: {
          anyOf: [{
            type: 'string',
            '$jsreport-constantOrArray': ['*']
          }, {
            type: 'array',
            items: { type: 'string' }
          }]
        },
        timeout: { type: 'number' },
        templateCache: {
          type: 'object',
          properties: {
            max: { type: 'number' },
            enabled: { type: 'boolean' }
          }
        }
      }
    },
    store: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['memory'] }
      }
    },
    blobStorage: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['memory', 'fs'] }
      }
    },
    extensions: {
      type: 'object',
      properties: {}
    },
    extensionsList: {
      type: 'array',
      items: { type: 'string' }
    }
  }
})

module.exports.ignoreInitial = [
  'properties.store.properties.provider',
  'properties.blobStorage.properties.provider'
]
