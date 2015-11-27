/*!
 * Copyright(c) 2015 Jan Blaha
 *
 * DocumentStore data layer provider using in memory nedb.
 */

var q = require('q')
var Datastore = require('nedb')
var ProviderBase = require('./providerBase')
var CollectionBase = require('./collectionBase')
var util = require('util')

function MemoryCollection () {
  CollectionBase.apply(this, arguments)
}

util.inherits(MemoryCollection, CollectionBase)

var MemoryProvider = module.exports = function () {
  ProviderBase.apply(this, arguments)
  this._options.logger.info('Creating memory store')
}

util.inherits(MemoryProvider, ProviderBase)

MemoryProvider.prototype.createCollection = function () {
  var args = Array.prototype.slice.call(arguments)
  args.unshift(null)
  return new (Function.prototype.bind.apply(MemoryCollection, args))
}

MemoryProvider.prototype.drop = function () {
  return q()
}

MemoryProvider.prototype.odata = function (odataServer) {
  var self = this
  odataServer.model(this._model)
    .onNeDB(function (col, cb) {
      cb(null, self.collections[col]._db)
    })
}

MemoryCollection.prototype.load = function () {
  this._db = new Datastore({
    filename: '',
    autoload: false,
    inMemoryOnly: true
  })

  return q.ninvoke(this._db, 'loadDatabase')
}

MemoryCollection.prototype.invokeFind = function (query) {
  return q.ninvoke(this._db, 'find', query)
}

MemoryCollection.prototype.invokeCount = function (query) {
  return q.ninvoke(this._db, 'count', query)
}

MemoryCollection.prototype.invokeInsert = function (doc) {
  return q.ninvoke(this._db, 'insert', doc)
}

MemoryCollection.prototype.invokeUpdate = function (query, update, options) {
  options = options || {}
  return q.ninvoke(this._db, 'update', query, update, options)
}

MemoryCollection.prototype.invokeRemove = function (query) {
  return q.ninvoke(this._db, 'remove', query)
}

