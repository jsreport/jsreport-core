
async function resolveEntityPath (reporter, entity, nameAttr, lookup, req) {
  const fullPath = []
  let currentEntity = entity

  while (currentEntity != null) {
    if (currentEntity.folder != null) {
      let folder

      if (lookup) {
        folder = await lookup(currentEntity.folder.shortid)
      } else {
        folder = await reporter.documentStore.collection('folders').findOne({
          shortid: currentEntity.folder.shortid
        }, req)
      }

      if (folder != null) {
        fullPath.unshift(folder.name)
        currentEntity = folder
      } else {
        throw new Error(`Folder with shortid "${currentEntity.folder.shortid}" does not exists`)
      }
    } else {
      currentEntity = null
    }
  }

  fullPath.push(entity[nameAttr])

  return `/${fullPath.join('/')}`
}

module.exports = (reporter) => async (entity, entitySet, req, lookup) => {
  const entitySetInfo = reporter.documentStore.model.entitySets[entitySet]

  if (!entitySetInfo) {
    throw new Error(`Unknown entitySet "${entitySet}"`)
  }

  if (entitySetInfo.entityTypePublicKey == null) {
    throw new Error(`Could not find name attribute of entity of type "${entitySet}"`)
  }

  return resolveEntityPath(reporter, entity, entitySetInfo.entityTypePublicKey, lookup, req)
}
