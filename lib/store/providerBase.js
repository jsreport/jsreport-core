/*!
 * Copyright(c) 2015 Jan Blaha
 *
 * Provider base class for document store providers
 */

var Promise = require('bluebird')

var ProviderBase = module.exports = function (model, options) {
  this._model = model
  this._options = options
  this.collections = {}
}

ProviderBase.prototype.init = function () {
  var self = this
  var promises = Object.keys(this._model.entitySets).map(function (key) {
    var entitySet = self._model.entitySets[key]
    var col = self.createCollection(key, entitySet, self._model.entityTypes[entitySet.entityType.replace('jsreport.', '')], self._options)
    self.collections[key] = col
    return col.load()
  })

  return Promise.all(promises)
}

ProviderBase.prototype.drop = function () {
  return Promise.resolve()
}

ProviderBase.prototype.collection = function (name) {
  return this.collections[name]
}

ProviderBase.prototype.adaptOData = function (odataServer) {
  var self = this

  odataServer.beforeQuery(function (col, query, req, cb) {
    self._options.logger.debug('OData query on ' + col)
    self.collections[col].beforeFindListeners.fire(query.$filter, req).then(function () {
      cb()
    }).catch(cb)
  }).beforeUpdate(function (col, query, update, req, cb) {
    self._options.logger.debug('OData update on ' + col)
    self.collections[col].beforeUpdateListeners.fire(query, update, req).then(function () {
      cb()
    }).catch(cb)
  }).beforeRemove(function (col, query, req, cb) {
    self._options.logger.debug('OData remove from ' + col + ' ' + JSON.stringify(query))
    self.collections[col].beforeRemoveListeners.fire(query, req).then(function () {
      cb()
    }).catch(cb)
  }).beforeInsert(function (col, doc, req, cb) {
    self._options.logger.debug('OData insert into ' + col)
    self.collections[col].beforeInsertListeners.fire(doc, req).then(function () {
      cb()
    }).catch(cb)
  })

  self.odata(odataServer)
}

