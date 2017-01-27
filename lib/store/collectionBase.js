/*!
 * Copyright(c) 2015 Jan Blaha
 *
 * Base class for document store - provider's entity collections
 */

var ListenerCollection = require('listener-collection')
var Promise = require('bluebird')

function CollectionBase (name, entitySet, entityType, options) {
  this.name = name
  this._options = options
  this.entitySet = entitySet
  this.entityType = entityType
  this.beforeFindListeners = new ListenerCollection()
  this.beforeUpdateListeners = new ListenerCollection()
  this.beforeInsertListeners = new ListenerCollection()
  this.beforeRemoveListeners = new ListenerCollection()
}

CollectionBase.prototype.load = function () {
  return Promise.resolve()
}

CollectionBase.prototype.find = function (query, req) {
  var self = this
  return this.beforeFindListeners.fire(query, req).then(function () {
    return self.invokeFind(query, req).then(function (res) {
      self._convertBinaryToBuffer(res)
      return res
    })
  })
}

CollectionBase.prototype.count = function (query) {
  return this.invokeCount(query)
}

CollectionBase.prototype.insert = function (doc, req) {
  var self = this
  return this.beforeInsertListeners.fire(doc, req).then(function () {
    return self.invokeInsert(doc, req)
  })
}

CollectionBase.prototype.update = function (query, update, options, req) {
  if (options && options.httpVersion) {
    req = options
    options = {}
  }

  options = options || {}
  var self = this
  return this.beforeUpdateListeners.fire(query, update, req).then(function () {
    return self.invokeUpdate(query, update, options, req)
  })
}

CollectionBase.prototype.remove = function (query, req) {
  var self = this
  return this.beforeRemoveListeners.fire(query, req).then(function () {
    return self.invokeRemove(query, req)
  })
}

CollectionBase.prototype._convertBinaryToBuffer = function (res) {
  var self = this
  for (var i in res) {
    for (var prop in res[i]) {
      if (!prop) {
        continue
      }

      var propDef = self.entityType[prop]

      if (!propDef) {
        continue
      }

      if (propDef.type === 'Edm.Binary') {
        // nedb returns object instead of buffer on node 4
        if (!Buffer.isBuffer(res[i][prop]) && !res[i][prop].length) {
          var obj = res[i][prop]
          obj = obj.data || obj
          res[i][prop] = Object.keys(obj).map(function (key) {
            return obj[key]
          })
        }

        res[i][prop] = new Buffer(res[i][prop])
      }
    }
  }
}

module.exports = CollectionBase

