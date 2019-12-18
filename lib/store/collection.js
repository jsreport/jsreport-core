const ListenerCollection = require('listener-collection')
const createError = require('../util/createError')
const validateEntityName = require('../util/validateEntityName')

module.exports = (entitySet, provider, model, validator, encryption, transactions) => ({
  name: entitySet,
  beforeFindListeners: new ListenerCollection(),
  beforeUpdateListeners: new ListenerCollection(),
  beforeInsertListeners: new ListenerCollection(),
  beforeRemoveListeners: new ListenerCollection(),
  entitySet,

  load: (...args) => {
    provider.load(entitySet, ...args)
  },

  find (q, p, req) {
    if (p && p.__isJsreportRequest__ === true) {
      req = p
      p = {}
    }

    p = p || {}

    const listenerPromise = this.beforeFindListeners.fire(q, p, req)

    // the jsreport backcompatible API for find returns promise with the result array
    // the new API returns a cursor like mongo uses
    // to make it working for both way of calling, we return
    // an object which is a promise and in the same time a cursor
    const cursorCalls = []
    const functions = ['skip', 'limit', 'sort', 'toArray', 'count']
    const fakeCursor = {}
    functions.forEach((f) => {
      fakeCursor[f] = (...args) => {
        cursorCalls.push({f: f, args: args})
        return fakeCursor
      }
    })

    const replay = (cursor) => {
      cursorCalls.filter((c) => c.f !== 'toArray' && c.f !== 'count').forEach((c) => cursor[c.f].apply(cursor, c.args))

      if (cursorCalls.find((c) => c.f === 'count')) {
        return cursor.count()
      }

      return cursor.toArray()
    }

    return Object.assign(fakeCursor, {
      then: (onFulfilled, onRejected) => {
        // the node A compatible promise expects then to be called with two functions
        // the bluebird expects to return a promise
        let promise = listenerPromise.then(() => {
          return replay(provider.find(entitySet, q, p, {
            transaction: transactions.getActiveTransaction(req)
          }))
        })

        // the node A compatible promise expects then to be called with two functions
        // the bluebird expects to return a promise
        if (typeof onFulfilled === 'function') {
          promise = promise.then(onFulfilled)
        }

        if (typeof onRejected === 'function') {
          promise = promise.catch(onRejected)
        }

        return promise
      }
    })
  },

  count (...args) {
    return this.find(...args).count()
  },

  async insert (data, req) {
    // internal entities are not in the model
    const publicKey = model.entitySets[entitySet] ? model.entitySets[entitySet].entityTypePublicKey : null

    if (publicKey) {
      validateEntityName(data[publicKey])
    }

    const entityType = model.entitySets[entitySet] ? model.entitySets[entitySet].entityType.replace(model.namespace + '.', '') : null

    if (entityType != null && validator.getSchema(entityType) != null) {
      const validationResult = validator.validate(entityType, data)

      if (!validationResult.valid) {
        throw createError(`Error when trying to insert into "${entitySet}" collection. input contain values that does not match the schema. ${validationResult.fullErrorMessage}`, {
          weak: true,
          statusCode: 400
        })
      }
    }

    await this.beforeInsertListeners.fire(data, req)

    return provider.insert(entitySet, data, {
      transaction: transactions.getActiveTransaction(req)
    })
  },

  async update (q, u, o, req) {
    if (o && o.__isJsreportRequest__) {
      req = o
      o = {}
    }

    // internal entities are not in the model
    const publicKey = model.entitySets[entitySet] ? model.entitySets[entitySet].entityTypePublicKey : null

    if (publicKey && u.$set[publicKey] !== undefined) {
      validateEntityName(u.$set[publicKey])
    }

    const entityType = model.entitySets[entitySet] ? model.entitySets[entitySet].entityType.replace(model.namespace + '.', '') : null

    if (entityType != null && validator.getSchema(entityType) != null) {
      const validationResult = validator.validate(entityType, u.$set)

      if (!validationResult.valid) {
        throw createError(`Error when trying to update "${entitySet}" collection. input contain values that does not match the schema. ${validationResult.fullErrorMessage}`, {
          weak: true,
          statusCode: 400
        })
      }
    }

    await this.beforeUpdateListeners.fire(q, u, o, req)

    const updateOpts = Object.assign({}, o)
    const activeTran = transactions.getActiveTransaction(req)

    if (activeTran) {
      updateOpts.transaction = activeTran
    }

    return provider.update(entitySet, q, u, updateOpts)
  },

  async remove (q, req) {
    await this.beforeRemoveListeners.fire(q, req)

    return provider.remove(entitySet, q, {
      transaction: transactions.getActiveTransaction(req)
    })
  },

  async findOne (...args) {
    const res = await this.find(...args)
    if (res.length > 0) {
      return res[0]
    }

    return null
  },

  async serializeProperties (docs, customTypeDef) {
    let typeDef

    if (customTypeDef == null) {
      const entitySetInfo = model.entitySets[entitySet]
      const entityType = model.entityTypes[entitySetInfo.entityType.replace(model.namespace + '.', '')]
      typeDef = entityType
    } else {
      typeDef = customTypeDef
    }

    return Promise.all(docs.map(async (doc) => {
      if (doc == null) {
        return doc
      }

      const collectionTypeRegExp = /^Collection\((\S+)\)$/
      const newDoc = Object.assign({}, doc)

      for (const prop in newDoc) {
        if (!prop) {
          continue
        }

        const propDef = typeDef[prop]
        let isCollection = false

        if (!propDef || propDef.type == null) {
          continue
        }

        let propType = propDef.type.replace(model.namespace + '.', '')
        const collectionResult = collectionTypeRegExp.exec(propType)

        if (collectionResult != null && collectionResult[1] != null) {
          isCollection = true
          propType = collectionResult[1]
        }

        if (propDef.encrypted === true) {
          newDoc[prop] = await encryption.decrypt(newDoc[prop])
        }

        if (model.complexTypes[propType] != null) {
          const asArray = isCollection && Array.isArray(newDoc[prop])
          const result = await this.serializeProperties(asArray ? newDoc[prop] : [newDoc[prop]], model.complexTypes[propType])

          if (asArray) {
            newDoc[prop] = result
          } else {
            newDoc[prop] = result[0]
          }
        } else if (propType === 'Edm.Binary') {
          newDoc[prop] = Buffer.from(newDoc[prop]).toString('base64')  // eslint-disable-line
        }
      }

      return newDoc
    }))
  },

  async deserializeProperties (docs, customTypeDef) {
    let typeDef

    if (customTypeDef == null) {
      const entitySetInfo = model.entitySets[entitySet]

      if (!entitySetInfo) {
        return []
      }

      const entityType = model.entityTypes[entitySetInfo.entityType.replace(model.namespace + '.', '')]

      if (!entityType) {
        return []
      }

      typeDef = entityType
    } else {
      typeDef = customTypeDef
    }

    return Promise.all(docs.map(async (doc) => {
      if (doc == null) {
        return doc
      }

      const collectionTypeRegExp = /^Collection\((\S+)\)$/
      const newDoc = Object.assign({}, doc)

      for (const prop in newDoc) {
        if (!prop) {
          continue
        }

        const propDef = typeDef[prop]
        let isCollection = false

        if (!propDef || propDef.type == null) {
          continue
        }

        let propType = propDef.type.replace(model.namespace + '.', '')
        const collectionResult = collectionTypeRegExp.exec(propType)

        if (collectionResult != null && collectionResult[1] != null) {
          isCollection = true
          propType = collectionResult[1]
        }

        if (model.complexTypes[propType] != null) {
          const asArray = isCollection && Array.isArray(newDoc[prop])
          const result = await this.deserializeProperties(asArray ? newDoc[prop] : [newDoc[prop]], model.complexTypes[propType])

          if (asArray) {
            newDoc[prop] = result
          } else {
            newDoc[prop] = result[0]
          }
        } else if (propDef.type === 'Edm.Binary') {
          newDoc[prop] = Buffer.from(newDoc[prop], 'base64')  // eslint-disable-line
        }

        if (propDef.encrypted === true) {
          newDoc[prop] = await encryption.encrypt(newDoc[prop])
        }
      }

      return newDoc
    }))
  }
})
