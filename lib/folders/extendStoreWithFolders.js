const nanoid = require('nanoid')

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

  reporter.initializeListeners.add('folder-entity', async () => {
    reporter.documentStore.collection('folders').beforeInsertListeners.add('folders', (doc) => {
      doc.shortid = doc.shortid || nanoid(7)
      doc.creationDate = new Date()
    })

    reporter.documentStore.collection('folders').beforeUpdateListeners.add('folders', (query, update) => {
      update.$set.modificationDate = new Date()
    })

    reporter.documentStore.collection('folders').beforeRemoveListeners.add('folders', async (q, req) => {
      const foldersToRemove = await reporter.documentStore.collection('folders').find(q, req)

      for (const folder of foldersToRemove) {
        for (const c of Object.keys(reporter.documentStore.collections)) {
          const entities = await reporter.documentStore.collection(c).find({
            folder: {
              shortid: folder.shortid
            }
          }, req)

          if (entities.length === 0) {
            continue
          }

          for (const e of entities) {
            await reporter.documentStore.collection(c).remove({
              _id: e._id
            }, req)
          }
        }
      }
    })
  })
}
