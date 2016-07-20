/*!
 * Copyright(c) 2014 Jan Blaha
 *
 * Key-Value persistent store for jsreport using DocumentStore to persist items.
 */

var _ = require('underscore')

var Settings = module.exports = function () {
  this._collection = []
}

Settings.prototype.add = function (key, value) {
  var settingItem = {
    key: key,
    value: typeof value !== 'string' ? JSON.stringify(value) : value
  }

  this._collection.push(settingItem)
  return this.documentStore.collection('settings').insert(settingItem)
}

Settings.prototype.get = function (key) {
  return _.findWhere(this._collection, {key: key})
}

Settings.prototype.findValue = function (key) {
  return this.documentStore.collection('settings').find({key: key}).then(function (res) {
    if (res.length !== 1) {
      return null
    }

    return typeof res[0].value === 'string' ? JSON.parse(res[0].value) : res[0].value
  })
}

Settings.prototype.set = function (key, avalue) {
  var value = typeof avalue !== 'string' ? JSON.stringify(avalue) : avalue

  this.get(key).value = value

  return this.documentStore.collection('settings').update({
    key: key
  }, {
    $set: {value: value}
  })
}

Settings.prototype.addOrSet = function (key, value) {
  if (this.get(key) === undefined) {
    return this.add(key, value)
  }

  return this.set(key, value)
}

Settings.prototype.init = function (documentStore) {
  this.documentStore = documentStore
  var self = this

  return documentStore.collection('settings').find({}).then(function (res) {
    self._collection = res.map(function (v) {
      return {
        key: v.key,
        value: typeof v.value === 'string' ? JSON.parse(v.value) : v.value
      }
    })
  })
}

Settings.prototype.registerEntity = function (documentStore) {
  documentStore.registerEntityType('SettingType', {
    _id: {type: 'Edm.String', key: true},
    key: {type: 'Edm.String'},
    value: {type: 'Edm.String'}
  })

  documentStore.registerEntitySet('settings', {entityType: 'jsreport.SettingType', shared: true})
}

module.exports = Settings

