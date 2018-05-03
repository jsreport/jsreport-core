
module.exports = () => ({
  type: 'object',
  properties: {
    rootDirectory: { type: 'string' },
    appDirectory: { type: 'string' },
    parentModuleDirectory: { type: 'string' },
    tempDirectory: { type: 'string' },
    loadConfig: { type: 'boolean' },
    autoTempCleanup: { type: 'boolean' },
    discover: { type: 'boolean' },
    useExtensionsLocationCache: { type: 'boolean' },
    logger: {
      type: 'object',
      properties: {
        silent: { type: 'boolean' }
      }
    },
    renderingSource: { type: 'string', enum: ['trusted', 'untrusted'] },
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
