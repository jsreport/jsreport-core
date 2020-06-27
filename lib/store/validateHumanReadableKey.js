const omit = require('lodash.omit')

module.exports = (reporter) => {
  reporter.initializeListeners.add('core-validate-humanReadableKey', () => {
    for (const c of Object.keys(reporter.documentStore.collections)) {
      reporter.documentStore.collection(c).beforeInsertListeners.add('validate-humanReadableKey', (doc, req) => {
        return validateHumanReadableKey(reporter, c, doc, undefined, req)
      })

      reporter.documentStore.collection(c).beforeUpdateListeners.add('validate-humanReadableKey', async (q, update, opts, req) => {
        const humanReadableKey = reporter.documentStore.model.entitySets[c].humanReadableKey

        if (update.$set && opts && opts.upsert === true) {
          await validateHumanReadableKey(reporter, c, update.$set, undefined, req)
        }

        if (!humanReadableKey || !update.$set[humanReadableKey]) {
          return
        }

        const entitiesToUpdate = await reporter.documentStore.collection(c).find(q, req)
        return Promise.all(entitiesToUpdate.map(e => validateHumanReadableKey(reporter, c, Object.assign({}, e, update.$set), e._id, req)))
      })
    }
  })
}

async function findEntity (reporter, collectionName, humanReadableValue, req) {
  const humanReadableKey = reporter.documentStore.model.entitySets[collectionName].humanReadableKey

  if (!humanReadableKey) {
    return
  }

  const localReq = req ? reporter.Request(req) : req

  // we should validate without caring about permissions
  if (localReq) {
    localReq.context = localReq.context ? omit(localReq.context, 'user') : localReq.context
  }

  const existingEntity = await reporter.documentStore.collection(collectionName).findOne({
    [humanReadableKey]: humanReadableValue
  }, localReq)

  return existingEntity
}

async function validateHumanReadableKey (reporter, collectionName, doc, originalIdValue, req) {
  const humanReadableKey = reporter.documentStore.model.entitySets[collectionName].humanReadableKey

  if (!humanReadableKey) {
    return
  }

  const humanReadableValue = doc[humanReadableKey]

  if (!humanReadableValue) {
    throw reporter.createError(`Entity "${humanReadableKey}" property can not be empty`, {
      statusCode: 400
    })
  }

  const existingEntity = await findEntity(reporter, collectionName, humanReadableValue, req)

  if (existingEntity) {
    if (originalIdValue != null && existingEntity._id === originalIdValue) {
      return
    }

    throw reporter.createError(`Entity with ${humanReadableKey} "${humanReadableValue}" already exists.`, {
      statusCode: 400,
      code: 'DUPLICATED_ENTITY',
      existingEntity,
      existingEntityEntitySet: collectionName
    })
  }
}
