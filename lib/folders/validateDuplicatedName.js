const omit = require('lodash.omit')
const resolveEntityPath = require('./resolveEntityPath')

async function findEntity (reporter, name, folder, req) {
  for (const c of Object.keys(reporter.documentStore.collections)) {
    const publicKey = reporter.documentStore.model.entitySets[c].entityTypePublicKey
    if (!publicKey) {
      continue
    }

    const localReq = req ? reporter.Request(req) : req

    // we should validate against all entities without caring about permissions
    if (localReq) {
      localReq.context = localReq.context ? omit(localReq.context, 'user') : localReq.context
    }

    const allEntities = await reporter.documentStore.collection(c).find({
      folder
    }, {
      [publicKey]: 1
    }, localReq)

    const existingEntity = allEntities.find((entity) => {
      if (entity[publicKey]) {
        // doing the check for case insensitive string (foo === FOO)
        return entity[publicKey].toLowerCase() === name.toLowerCase()
      }

      return false
    })

    if (existingEntity) {
      return { entity: existingEntity, entitySet: c }
    }
  }
}

async function validateDuplicatedName (reporter, c, doc, originalIdValue, req) {
  const publicKey = reporter.documentStore.model.entitySets[c].entityTypePublicKey
  const resolveEntityPathFn = resolveEntityPath(reporter)

  if (!publicKey) {
    return
  }

  const name = doc[publicKey]

  if (!name) {
    return
  }

  const existingEntity = await findEntity(reporter, name, doc.folder, req)

  if (existingEntity) {
    if (originalIdValue != null && existingEntity.entity._id === originalIdValue) {
      return
    }

    let msg = `Entity with ${publicKey} "${name}" already exists`
    let folder

    if (doc.folder != null) {
      folder = await reporter.documentStore.collection('folders').findOne({
        shortid: doc.folder.shortid
      }, req)

      if (folder) {
        const folderFullPath = await resolveEntityPathFn(folder, 'folders', req)

        msg = `${msg} in the ${folderFullPath} folder.`
      } else {
        msg = `${msg} in the same folder.`
      }
    } else {
      msg = `${msg} at the root level.`
    }

    const existingEntityPublicKey = reporter.documentStore.model.entitySets[existingEntity.entitySet].entityTypePublicKey

    // prints existing name in message when name are different, this can happen because the name validation
    // is case insensitivity (uppercase and lowercase form are equivalent)
    if (existingEntityPublicKey && existingEntity.entity[existingEntityPublicKey] !== name) {
      msg = `${msg} existing: "${existingEntity.entity[existingEntityPublicKey]}".`
    }

    throw reporter.createError(msg, {
      statusCode: 400,
      code: 'DUPLICATED_ENTITY',
      existingEntity: existingEntity.entity,
      existingEntityEntitySet: existingEntity.entitySet
    })
  }
}

module.exports = function (reporter) {
  for (const c of Object.keys(reporter.documentStore.collections)) {
    reporter.documentStore.collection(c).beforeInsertListeners.add('unique-name-folders', (doc, req) => validateDuplicatedName(reporter, c, doc, undefined, req))
    reporter.documentStore.collection(c).beforeUpdateListeners.add('unique-name-folders', async (q, update, opts, req) => {
      if (update.$set && opts && opts.upsert === true) {
        await validateDuplicatedName(reporter, c, update.$set, undefined, req)
      }

      // we need to get folder spec so we need to load them anyway
      const entitiesToUpdate = await reporter.documentStore.collection(c).find(q, req)
      return Promise.all(entitiesToUpdate.map(e => validateDuplicatedName(reporter, c, Object.assign({}, e, update.$set), e._id, req)))
    })
  }
}

module.exports.validateDuplicatedName = validateDuplicatedName
