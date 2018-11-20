const resolveFolderFromPath = require('./resolveFolderFromPath')
const nanoid = require('nanoid')
const validateReservedName = require('./validateReservedName')
const cascadeFolderRemove = require('./cascadeFolderRemove')

module.exports = (reporter) => {
  reporter.documentStore.registerEntityType('FolderType', {
    _id: { type: 'Edm.String', key: true },
    name: { type: 'Edm.String', publicKey: true },
    shortid: { type: 'Edm.String' },
    creationDate: { type: 'Edm.DateTimeOffset' },
    modificationDate: { type: 'Edm.DateTimeOffset' }
  })

  reporter.documentStore.registerEntitySet('folders', {
    entityType: 'jsreport.FolderType',
    humanReadableKey: 'shortid',
    splitIntoDirectories: true
  })

  reporter.documentStore.registerComplexType('FolderRefType', {
    'shortid': { type: 'Edm.String' }
  })

  // before document store initialization, extend all entity types with folder information
  reporter.documentStore.on('before-init', (documentStore) => {
    Object.entries(documentStore.model.entitySets).forEach(([k, entitySet]) => {
      const entityTypeName = entitySet.entityType.replace(documentStore.model.namespace + '.', '')

      documentStore.model.entityTypes[entityTypeName].folder = {
        type: 'jsreport.FolderRefType'
      }
    })
  })

  reporter.documentStore.on('internal-after-init', () => validateReservedName(reporter))
  reporter.documentStore.on('internal-after-init', () => cascadeFolderRemove(reporter))
  reporter.documentStore.on('internal-after-init', () => {
    reporter.documentStore.collection('folders').beforeInsertListeners.add('folders', (doc) => {
      doc.shortid = doc.shortid || nanoid(7)
      doc.creationDate = new Date()
    })

    reporter.documentStore.collection('folders').beforeUpdateListeners.add('folders', (query, update) => {
      update.$set.modificationDate = new Date()
    })
  })

  return {
    resolveFolderFromPath: resolveFolderFromPath(reporter)
  }
}
