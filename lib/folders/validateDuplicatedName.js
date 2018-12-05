async function findEntity (reporter, name, folder, req) {
  for (const c of Object.keys(reporter.documentStore.collections)) {
    const publicKey = reporter.documentStore.model.entitySets[c].entityTypePublicKey
    if (!publicKey) {
      continue
    }

    const existingEntity = await reporter.documentStore.collection(c).findOne({
      [publicKey]: new RegExp(`^${name}$`, 'i'),
      folder
    }, req)

    if (existingEntity) {
      return { entity: existingEntity, entitySet: c }
    }
  }
}

async function validateDuplicatedName (reporter, c, doc, req) {
  const publicKey = reporter.documentStore.model.entitySets[c].entityTypePublicKey
  if (!publicKey) {
    return
  }

  const name = doc[publicKey]

  if (!name) {
    return
  }

  const existingEntity = await findEntity(reporter, name, doc.folder, req)

  if (existingEntity && existingEntity.entity._id !== doc._id) {
    throw reporter.createError(`The name "${name}" already exist in the same folder.${
      existingEntity.entity[publicKey] !== name ? ` existing: "${existingEntity.entity[publicKey]}"` : ''
    }`, {
      statusCode: 400,
      code: 'DUPLICATED_ENTITY',
      existingEntity: existingEntity.entity,
      existingEntityEntitySet: existingEntity.entitySet
    })
  }
}

module.exports = function (reporter) {
  for (const c of Object.keys(reporter.documentStore.collections)) {
    reporter.documentStore.collection(c).beforeInsertListeners.add('unique-name-folders', (doc, req) => validateDuplicatedName(reporter, c, doc, req))
    reporter.documentStore.collection(c).beforeUpdateListeners.add('unique-name-folders', async (q, update, opts, req) => {
      // we need to get folder spec so we need to load them anyway
      const entitiesToUpdate = await reporter.documentStore.collection(c).find(q, req)
      return Promise.all(entitiesToUpdate.map(e => validateDuplicatedName(reporter, c, Object.assign({}, e, update.$set), req)))
    })
  }
}
