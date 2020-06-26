const omit = require('lodash.omit')

module.exports = (reporter) => {
  reporter.initializeListeners.add('core-validate-id', () => {
    for (const c of Object.keys(reporter.documentStore.collections)) {
      reporter.documentStore.collection(c).beforeInsertListeners.add('validate-id', (doc, req) => {
        return validateId(reporter, c, doc, undefined, req)
      })

      reporter.documentStore.collection(c).beforeUpdateListeners.add('validate-id', async (q, update, opts, req) => {
        if (update.$set && opts && opts.upsert === true) {
          await validateId(reporter, c, update.$set, undefined, req)
        }

        if (!update.$set._id) {
          return
        }

        const entitiesToUpdate = await reporter.documentStore.collection(c).find(q, req)
        return Promise.all(entitiesToUpdate.map(e => validateId(reporter, c, Object.assign({}, e, update.$set), e._id, req)))
      })
    }
  })
}

async function findEntity (reporter, collectionName, idValue, req) {
  const localReq = req ? reporter.Request(req) : req

  // we should validate without caring about permissions
  if (localReq) {
    localReq.context = localReq.context ? omit(localReq.context, 'user') : localReq.context
  }

  const existingEntity = await reporter.documentStore.collection(collectionName).findOne({
    _id: idValue
  }, localReq)

  return existingEntity
}

async function validateId (reporter, collectionName, doc, originalIdValue, req) {
  const idValue = doc._id

  if (idValue == null) {
    return
  }

  const existingEntity = await findEntity(reporter, collectionName, idValue, req)

  if (existingEntity) {
    if (originalIdValue != null && existingEntity._id === originalIdValue) {
      return
    }

    throw reporter.createError(`Entity with _id "${idValue}" already exists.`, {
      statusCode: 400,
      code: 'DUPLICATED_ENTITY',
      existingEntity,
      existingEntityEntitySet: collectionName
    })
  }
}
