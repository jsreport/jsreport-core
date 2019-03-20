const omit = require('lodash.omit')
const { uid } = require('../util/util')
const nanoid = require('nanoid')

async function collectEntitiesInHierarchy (reporter, items, sourceEntity, req) {
  if (sourceEntity.__entitySet === 'folders') {
    items.push(sourceEntity)

    const lookup = []

    Object.entries(reporter.documentStore.model.entitySets).forEach(([k, entitySet]) => {
      lookup.push(reporter.documentStore.collection(k).find({
        folder: {
          shortid: sourceEntity.shortid
        }
      }, req).then((results) => {
        if (results.length === 0) {
          return
        }

        if (k === 'folders') {
          return Promise.all(results.map((folder) => {
            return collectEntitiesInHierarchy(
              reporter,
              items,
              Object.assign(folder, { __entitySet: k }),
              req
            )
          }))
        } else {
          results.forEach((entity) => {
            items.push(Object.assign(entity, {
              __entitySet: k
            }))
          })
        }
      }))
    })

    await Promise.all(lookup)
  } else {
    items.push(sourceEntity)
  }
}

async function throwIfEntityIsNotFolder (reporter, targetShortid, req) {
  const folder = await reporter.documentStore.collection('folders').findOne({
    shortid: targetShortid
  }, req)

  if (!folder) {
    throw reporter.createError(`Target entity "${targetShortid}" is not a folder, please review that the copy/move is against a valid folder entity`, {
      statusCode: 400
    })
  }
}

module.exports = (reporter) => async ({ source, target, shouldCopy, shouldReplace }, req) => {
  const sourceCol = reporter.documentStore.collection(source.entitySet)

  if (!sourceCol) {
    throw reporter.createError(`Invalid entity set "${source.entitySet}" for source`, {
      statusCode: 400
    })
  }

  const sourceEntity = await sourceCol.findOne({ _id: source.id }, req)

  if (!sourceEntity) {
    throw reporter.createError('Source entity with specified id does not exists', {
      statusCode: 400
    })
  }

  if (target.shortid === undefined) {
    throw reporter.createError('target should specify ".shortid"', {
      statusCode: 400
    })
  }

  let items = []

  await collectEntitiesInHierarchy(
    reporter,
    items,
    Object.assign(sourceEntity, { __entitySet: source.entitySet }),
    req
  )

  if (!shouldCopy) {
    // ignore if we are doing a move at the same level of hierarchy between source and target
    if (
      (sourceEntity.folder === null && target.shortid === null) ||
      (sourceEntity.folder != null &&
      target.shortid != null &&
      sourceEntity.folder.shortid === target.shortid)
    ) {
      return []
    }

    // validates that we can't move entities from higher level
    // into lower level of the same hierarchy
    if (items.some((item) => item.shortid === target.shortid)) {
      return []
    }

    if (target.shortid != null) {
      await throwIfEntityIsNotFolder(reporter, target.shortid, req)
    }

    let updateQ

    if (target.shortid === null) {
      updateQ = {
        $set: {
          folder: null
        }
      }
    } else {
      updateQ = {
        $set: {
          folder: {
            shortid: target.shortid
          }
        }
      }
    }

    try {
      await reporter.documentStore.collection(sourceCol.entitySet).update({
        _id: sourceEntity._id
      }, updateQ, req)
    } catch (e) {
      if (e.code === 'DUPLICATED_ENTITY' && shouldReplace) {
        // replacing is not supported when it generates a conflict with folder
        if (e.existingEntityEntitySet === 'folders') {
          throw e
        }

        const removeFolderQ = target.shortid === null ? { folder: null } : { folder: { shortid: target.shortid } }

        await reporter.documentStore.collection(e.existingEntityEntitySet).remove({
          _id: e.existingEntity._id,
          ...removeFolderQ
        }, req)

        await reporter.documentStore.collection(sourceCol.entitySet).update({
          _id: sourceEntity._id
        }, updateQ, req)
      } else {
        throw e
      }
    }

    items.forEach((item) => {
      if (item._id === sourceEntity._id) {
        if (target.shortid === null) {
          item.folder = null
        } else {
          item.folder = {
            shortid: target.shortid
          }
        }
      }
    })
  } else {
    // copy of folders does nothing for now (disabled), the logic bellow supports it
    // but we need to resolve some problems about updating references fields
    // of clones to ids of newer entities before we can enable this feature in folders for normal usage
    if (sourceEntity.__entitySet === 'folders') {
      return []
    }

    if (target.shortid != null) {
      await throwIfEntityIsNotFolder(reporter, target.shortid, req)
    }

    const newItems = []
    const newHierarchyMap = {}

    items.map((item) => {
      const newEntity = {
        ...omit(item, ['_id', 'shortid', '__entitySet', 'folder'])
      }

      if (source.id === item._id) {
        if (target.shortid === null) {
          newEntity.folder = null
        } else {
          newEntity.folder = {
            shortid: target.shortid
          }
        }
      }

      newEntity._id = uid(16)

      if (item.__entitySet === 'folders') {
        newEntity.shortid = nanoid(7)
      }

      newEntity.__entitySet = item.__entitySet

      newHierarchyMap[newEntity._id] = { old: item, new: newEntity, entitySet: newEntity.__entitySet }

      newItems.push(newEntity)
    })

    await Promise.all(newItems.map(async (newItem) => {
      const newEntityRecord = newHierarchyMap[newItem._id]
      let newShortid = null

      if (newItem.folder === undefined) {
        Object.keys(newHierarchyMap).some((newId) => {
          const currentItemRecord = newHierarchyMap[newId]

          if (
            newEntityRecord.old.folder != null &&
            newEntityRecord.old.folder.shortid === currentItemRecord.old.shortid
          ) {
            newShortid = currentItemRecord.new.shortid
            return true
          }

          return false
        })
      } else {
        newShortid = newItem.folder != null ? newItem.folder.shortid : null
      }

      if (newShortid === null) {
        newItem.folder = null
      } else {
        newItem.folder = {
          shortid: newShortid
        }
      }

      try {
        await reporter.documentStore.collection(newEntityRecord.entitySet).insert({
          ...omit(newItem, ['__entitySet'])
        }, req)
      } catch (e) {
        if (e.code === 'DUPLICATED_ENTITY' && shouldReplace) {
          // replacing is not supported when it generates a conflict with folder
          if (e.existingEntityEntitySet === 'folders') {
            throw e
          }

          const removeFolderQ = target.shortid === null ? { folder: null } : { folder: { shortid: target.shortid } }

          await reporter.documentStore.collection(e.existingEntityEntitySet).remove({
            _id: e.existingEntity._id,
            ...removeFolderQ
          }, req)

          await reporter.documentStore.collection(newEntityRecord.entitySet).insert({
            ...omit(newItem, ['__entitySet'])
          }, req)
        } else {
          throw e
        }
      }
    }))

    items = newItems
  }

  // return fresh version of creationDate, modificationDate in the records.
  // this helps with concurrent validation on studio
  await Promise.all(items.map(async (item) => {
    const entitySet = reporter.documentStore.model.entitySets[item.__entitySet]
    const entityTypeName = entitySet.entityType
    const entityType = reporter.documentStore.model.entityTypes[entityTypeName.split('.')[1]]
    const projection = {}

    if (entityType.creationDate != null && entityType.creationDate.type === 'Edm.DateTimeOffset') {
      projection.creationDate = 1
    }

    if (entityType.modificationDate != null && entityType.modificationDate.type === 'Edm.DateTimeOffset') {
      projection.modificationDate = 1
    }

    if (Object.keys(projection).length === 0) {
      return
    }

    const doc = await reporter.documentStore.collection(item.__entitySet).findOne({
      _id: item._id
    }, {
      creationDate: 1,
      modificationDate: 1
    }, req)

    if (projection.creationDate) {
      item.creationDate = doc.creationDate
    }

    if (projection.modificationDate) {
      item.modificationDate = doc.modificationDate
    }
  }))

  return items
}
