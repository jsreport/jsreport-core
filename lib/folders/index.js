const nanoid = require('nanoid')
const validateReservedName = require('./validateReservedName')
const cascadeFolderRemove = require('./cascadeFolderRemove')
const validateDuplicatedName = require('./validateDuplicatedName')
const resolveFolderFromPath = require('./resolveFolderFromPath')
const resolveEntityPath = require('./resolveEntityPath')
const moveBetweenFolders = require('./moveBetweenFolders')
const migrateEntitySetsToFolders = require('./migrateEntitySetsToFolders')

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
        type: 'jsreport.FolderRefType',
        // folder reference can be null when entity is at the root level
        schema: { type: 'null' }
      }
    })
  })

  reporter.documentStore.internalAfterInitListeners.add('core-validate-reserved-name', () => validateReservedName(reporter))
  reporter.documentStore.internalAfterInitListeners.add('core-cascade-remove', () => cascadeFolderRemove(reporter))
  reporter.documentStore.internalAfterInitListeners.add('core-validate-duplicated-name', () => validateDuplicatedName(reporter))
  reporter.documentStore.internalAfterInitListeners.add('core-folders', () => {
    reporter.documentStore.collection('folders').beforeInsertListeners.add('folders', (doc) => {
      doc.shortid = doc.shortid || nanoid(7)
      doc.creationDate = new Date()
    })

    reporter.documentStore.collection('folders').beforeUpdateListeners.add('folders', (query, update) => {
      update.$set.modificationDate = new Date()
    })
  })

  reporter.initializeListeners.insert(0, 'core-folders-migration', () => migrateEntitySetsToFolders(reporter))

  return {
    move: moveBetweenFolders(reporter),
    resolveEntityPath: resolveEntityPath(reporter),
    resolveFolderFromPath: resolveFolderFromPath(reporter)
  }
}
