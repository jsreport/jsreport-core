const ListenerCollection = require('listener-collection')
const validateEntityName = require('../util/validateEntityName')

function getEntityTypeFromModel (model, entitySetName) {
  if (model.entitySets[entitySetName] == null) {
    return
  }

  const entitySet = model.entitySets[entitySetName]
  const entityTypeName = entitySet.entityType.replace(model.namespace + '.', '')

  return model.entityTypes[entityTypeName]
}

module.exports = (entitySet, provider, model) => ({
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
    const entityType = getEntityTypeFromModel(model, entitySet)
    const data = args[0]

    // validate if "name" is defined in entityType
    if (entityType && entityType.name != null && data) {
      validateEntityName(data.name)
    }

    await this.beforeInsertListeners.fire(...args)
    return provider.insert(entitySet, ...args)
  },

  async update (q, u, o, req) {
    const entityType = getEntityTypeFromModel(model, entitySet)

    if (o && o.__isJsreportRequest__) {
      req = o
      o = {}
    }

    // validate if "name" is defined in entityType and name is being updated
    if (entityType && entityType.name != null && u && u.$set && u.$set.name !== undefined) {
      validateEntityName(u.$set.name)
    }

    await this.beforeUpdateListeners.fire(q, u, o, req)
    return provider.update(entitySet, q, u, o, req)
  },

  async remove (...args) {
    await this.beforeRemoveListeners.fire(...args)
    return provider.remove(entitySet, ...args)
  }
})
