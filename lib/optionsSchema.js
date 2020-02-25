
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
    reportTimeout: { type: 'number', description: 'global single timeout that controls how much a report generation should wait before it times out' },
    enableRequestReportTimeout: { type: 'boolean', default: false, description: 'option that enables passing a custom report timeout per request using req.options.timeout. this enables that the caller of the report generation control the report timeout so enable it only when you trust the caller' },
    allowLocalFilesAccess: { type: 'boolean', default: false },
    encryption: {
      type: 'object',
      default: {},
      properties: {
        secretKey: {
          type: 'string',
          minLength: 16,
          maxLength: 16
        },
        enabled: {
          type: 'boolean',
          default: true
        }
      }
    },
    templatingEngines: {
      type: 'object',
      properties: {
        strategy: { type: 'string', enum: ['in-process', 'dedicated-process', 'http-server'] },
        numberOfWorkers: { type: 'number' },
        forkOptions: {
          type: 'object',
          description: 'childProcess\'s fork options to pass to internal processes used by jsreport',
          properties: {
            execArgv: {
              anyOf: [{
                type: 'string',
                '$jsreport-constantOrArray': []
              }, {
                type: 'array',
                items: { type: 'string' }
              }]
            }
          }
        },
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
    },
    migrateEntitySetsToFolders: {
      type: 'boolean',
      default: true
    }
  }
})

module.exports.ignoreInitial = [
  'properties.store.properties.provider',
  'properties.blobStorage.properties.provider'
]
