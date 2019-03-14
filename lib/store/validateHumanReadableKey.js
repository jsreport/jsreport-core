
module.exports = (reporter) => {
  reporter.initializeListeners.add('core-validate-humanReadableKey', () => {
    for (const c of Object.keys(reporter.documentStore.collections)) {
      reporter.documentStore.collection(c).beforeInsertListeners.add('validate-humanReadableKey', (doc, req) => {
        return validateHumanReadableKey(reporter, c, doc, req)
      })

      reporter.documentStore.collection(c).beforeUpdateListeners.add('validate-humanReadableKey', async (q, update, opts, req) => {
        const humanReadableKey = reporter.documentStore.model.entitySets[c].humanReadableKey

        if (update.$set && opts && opts.upsert === true) {
          await validateHumanReadableKey(reporter, c, update.$set, req)
        }

        if (!humanReadableKey || !update.$set[humanReadableKey]) {
          return
        }

        const entitiesToUpdate = await reporter.documentStore.collection(c).find(q, req)
        return Promise.all(entitiesToUpdate.map(e => validateHumanReadableKey(reporter, c, Object.assign({}, e, update.$set), req)))
      })
    }
  })
}

async function findEntity (reporter, humanReadableValue, req) {
  for (const c of Object.keys(reporter.documentStore.collections)) {
    const humanReadableKey = reporter.documentStore.model.entitySets[c].humanReadableKey

    if (!humanReadableKey) {
      continue
    }

    const existingEntity = await reporter.documentStore.collection(c).findOne({
      [humanReadableKey]: humanReadableValue
    }, req)

    if (existingEntity) {
      return { entity: existingEntity, entitySet: c }
    }
  }
}

async function validateHumanReadableKey (reporter, c, doc, req) {
  const humanReadableKey = reporter.documentStore.model.entitySets[c].humanReadableKey

  if (!humanReadableKey) {
    return
  }

  const humanReadableValue = doc[humanReadableKey]

  if (!humanReadableValue) {
    throw reporter.createError(`Entity "${humanReadableKey}" property can not be empty`, {
      statusCode: 400
    })
  }

  const existingEntity = await findEntity(reporter, humanReadableValue, req)

  if (existingEntity && existingEntity.entity._id !== doc._id) {
    throw reporter.createError(`Entity with ${humanReadableKey} "${humanReadableValue}" already exists.`, {
      statusCode: 400,
      code: 'DUPLICATED_ENTITY',
      existingEntity: existingEntity.entity,
      existingEntityEntitySet: existingEntity.entitySet
    })
  }
}
