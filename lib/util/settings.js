/*!
 * Copyright(c) 2014 Jan Blaha
 *
 * Key-Value persistent store for jsreport using DocumentStore to persist items.
 */

var _ = require('underscore')

var Settings = module.exports = function () {
  this._collection = []
}

Settings.prototype.add = function (key, value, req) {
  var settingItem = {
    key: key,
    value: typeof value !== 'string' ? JSON.stringify(value) : value
  }

  this._collection.push(settingItem)
  return this.documentStore.collection('settings').insert(settingItem, req)
}

Settings.prototype.get = function (key) {
  return _.findWhere(this._collection, { key: key })
}

Settings.prototype.findValue = function (key, req) {
  return this.documentStore.collection('settings').find({ key: key }, req).then(function (res) {
    if (res.length !== 1) {
      return null
    }

    return typeof res[0].value === 'string' ? JSON.parse(res[0].value) : res[0].value
  })
}

Settings.prototype.set = function (key, avalue, req) {
  var value = typeof avalue !== 'string' ? JSON.stringify(avalue) : avalue

  this.get(key).value = value

  return this.documentStore.collection('settings').update({
    key: key
  }, {
    $set: { value: value }
  }, req)
}

Settings.prototype.addOrSet = function (key, avalue, req) {
  var value = typeof avalue !== 'string' ? JSON.stringify(avalue) : avalue

  return this.documentStore.collection('settings').update({ key: key }, { $set: { key: key, value: value } }, { upsert: true }, req)
}

Settings.prototype.init = function (documentStore) {
  this.documentStore = documentStore
  var self = this

  var incompatibleSettingsToRemove = []

  return documentStore.collection('settings').find({}).then(function (res) {
    res.forEach(function (v) {
      if (typeof v.value !== 'string') {
        return self._collection.push({
          key: v.key,
          value: v.value
        })
      }

      try {
        return self._collection.push({
          key: v.key,
          value: JSON.parse(v.value)
        })
      } catch (e) {
        incompatibleSettingsToRemove.push(v._id)
      }
    })
  }).then(function () {
    if (incompatibleSettingsToRemove.length) {
      return documentStore.collection('settings').remove({ _id: { $in: incompatibleSettingsToRemove } })
    }
  })
}

Settings.prototype.registerEntity = function (documentStore) {
  documentStore.registerEntityType('SettingType', {
    _id: { type: 'Edm.String', key: true },
    key: { type: 'Edm.String' },
    value: { type: 'Edm.String' }
  })

  documentStore.registerEntitySet('settings', { entityType: 'jsreport.SettingType', shared: true })
}

module.exports = Settings
