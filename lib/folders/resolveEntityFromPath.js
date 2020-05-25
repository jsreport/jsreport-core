const normalizeEntityPath = require('./normalizeEntityPath')

module.exports = (reporter) => async (entityPathParam, targetEntitySet, req) => {
  const entityPath = normalizeEntityPath(entityPathParam, req)
  const fragments = entityPath.split('/').filter(s => s)
  let currentEntity = null
  let currentEntitySet = null
  let currentFolder = null

  if (targetEntitySet) {
    const entitySet = reporter.documentStore.model.entitySets[targetEntitySet]

    if (!entitySet) {
      throw new Error(`Target entity set "${targetEntitySet}" does not exists`)
    }

    if (!entitySet.entityTypePublicKey) {
      throw new Error(`Entity set "${targetEntitySet}" does not have a public key`)
    }
  }

  if (fragments.length === 0) {
    return
  }

  const lastIndex = fragments.length - 1

  for (const [index, entityName] of fragments.entries()) {
    if (lastIndex === index) {
      if (!targetEntitySet) {
        for (const c of Object.keys(reporter.documentStore.collections)) {
          if (!reporter.documentStore.model.entitySets[c].entityTypePublicKey) {
            continue
          }

          const query = getSearchQuery(reporter.documentStore.model.entitySets[c].entityTypePublicKey, entityName, currentFolder)
          currentEntitySet = c
          currentEntity = await reporter.documentStore.collection(c).findOne(query, req)

          if (currentEntity) {
            break
          }
        }
      } else {
        const query = getSearchQuery(reporter.documentStore.model.entitySets[targetEntitySet].entityTypePublicKey, entityName, currentFolder)
        currentEntitySet = targetEntitySet
        currentEntity = await reporter.documentStore.collection(targetEntitySet).findOne(query, req)
      }
    } else {
      const query = getSearchQuery('name', entityName, currentFolder)
      const folder = await reporter.documentStore.collection('folders').findOne(query, req)

      if (!folder) {
        break
      }

      currentFolder = folder
    }
  }

  if (!currentEntity) {
    return
  }

  return {
    entitySet: currentEntitySet,
    entity: currentEntity
  }
}

function getSearchQuery (publicKey, publicKeyValue, currentFolder) {
  const query = {
    [publicKey]: decodeURIComponent(publicKeyValue)
  }

  if (currentFolder) {
    query.folder = { shortid: currentFolder.shortid }
  } else {
    query.folder = null
  }

  return query
}
