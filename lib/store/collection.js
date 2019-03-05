const ListenerCollection = require('listener-collection')
const createError = require('../util/createError')
const validateEntityName = require('../util/validateEntityName')

module.exports = (entitySet, provider, model, validator) => ({
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
        let promise = listenerPromise.then(() => replay(provider.find(entitySet, q, p)))

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

  async insert (...args) {
    const data = args[0]

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

    await this.beforeInsertListeners.fire(...args)
    return provider.insert(entitySet, ...args)
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
    return provider.update(entitySet, q, u, o, req)
  },

  async remove (...args) {
    await this.beforeRemoveListeners.fire(...args)
    return provider.remove(entitySet, ...args)
  },

  async findOne (...args) {
    const res = await this.find(...args)
    if (res.length > 0) {
      return res[0]
    }

    return null
  },

  convertBase64ToBufferInEntity (docs) {
    const entitySetInfo = model.entitySets[entitySet]

    if (!entitySetInfo) {
      return []
    }

    const entityType = model.entityTypes[entitySetInfo.entityType.replace(model.namespace + '.', '')]

    if (!entityType) {
      return []
    }

    return docs.map((doc) => {
      const newDoc = Object.assign({}, doc)

      for (const prop in newDoc) {
        if (!prop) {
          continue
        }

        const propDef = entityType[prop]

        if (!propDef) {
          continue
        }

        if (propDef.type === 'Edm.Binary') {
          newDoc[prop] = Buffer.from(newDoc[prop], 'base64')  // eslint-disable-line
        }
      }

      return newDoc
    })
  },

  convertBufferToBase64InEntity (docs) {
    const entitySetInfo = model.entitySets[entitySet]
    const entityType = model.entityTypes[entitySetInfo.entityType.replace(model.namespace + '.', '')]

    return docs.map((doc) => {
      const newDoc = Object.assign({}, doc)

      for (const prop in newDoc) {
        if (!prop) {
          continue
        }

        const propDef = entityType[prop]

        if (!propDef) {
          continue
        }

        if (propDef.type === 'Edm.Binary') {
          newDoc[prop] = Buffer.from(newDoc[prop]).toString('base64')  // eslint-disable-line
        }
      }

      return newDoc
    })
  }
})
