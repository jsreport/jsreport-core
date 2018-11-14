const nanoid = require('nanoid')

function validateReservedName (reporter, c, doc) {
  if (doc.folder) {
    return
  }

  const publicKey = reporter.documentStore.model.entitySets[c].entityTypePublicKey
  if (!publicKey) {
    return
  }

  const name = doc[publicKey]

  if (!name) {
    return
  }

  if (reporter.documentStore.model.entitySets[name] && !reporter.documentStore.model.entitySets[name].splitIntoDirectories) {
    throw reporter.createError(`The name "${name}" is reserved in the root folder.`, {
      statusCode: 400
    })
  }
}

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
    for (const c of Object.keys(reporter.documentStore.collections)) {
      if (!reporter.documentStore.model.entitySets[c].splitIntoDirectories) {
        continue
      }

      reporter.documentStore.collection(c).beforeInsertListeners.add('folders', (doc, req) => validateReservedName(reporter, c, doc))
      reporter.documentStore.collection(c).beforeUpdateListeners.add('folders', async (q, update, opts, req) => {
        const publicKey = reporter.documentStore.model.entitySets[c].entityTypePublicKey
        if (!update.$set[publicKey] || update.$set.folder) {
          return
        }

        // we need to get folder spec so we need to load them anyway
        const entitiesToUpdate = await reporter.documentStore.collection(c).find(q, req)
        entitiesToUpdate.forEach(e => validateReservedName(reporter, c, Object.assign({}, e, update.$set)))
      })
    }

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
