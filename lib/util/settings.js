/*!
 * Copyright(c) 2014 Jan Blaha
 *
 * Key-Value persistent store for jsreport using DocumentStore to persist items.
 */

const Settings = module.exports = function () {
  this._collection = []
}

Settings.prototype.add = function (key, value, req) {
  const settingItem = {
    key: key,
    value: typeof value !== 'string' ? JSON.stringify(value) : value
  }

  this._collection.push(settingItem)
  return this.documentStore.collection('settings').insert(settingItem, req)
}

Settings.prototype.get = function (key) {
  return this._collection.find((s) => s.key === key)
}

Settings.prototype.findValue = async function (key, req) {
  const res = await this.documentStore.collection('settings').find({ key: key }, req)
  if (res.length !== 1) {
    return null
  }

  return typeof res[0].value === 'string' ? JSON.parse(res[0].value) : res[0].value
}

Settings.prototype.set = function (key, avalue, req) {
  const value = typeof avalue !== 'string' ? JSON.stringify(avalue) : avalue

  this.get(key).value = value

  return this.documentStore.collection('settings').update({
    key: key
  }, {
    $set: { value: value }
  }, req)
}

Settings.prototype.addOrSet = async function (key, avalue, req) {
  var value = typeof avalue !== 'string' ? JSON.stringify(avalue) : avalue

  const updateCount = await this.documentStore.collection('settings').update({ key }, { $set: { key: key, value: value } }, req)

  if (updateCount === 0) {
    await this.documentStore.collection('settings').insert({ key: key, value: value }, req)
    return 1
  }
}

Settings.prototype.init = async function (documentStore) {
  this.documentStore = documentStore

  const incompatibleSettingsToRemove = []

  const res = await documentStore.collection('settings').find({})
  res.forEach((v) => {
    if (typeof v.value !== 'string') {
      return this._collection.push({
        key: v.key,
        value: v.value
      })
    }

    try {
      return this._collection.push({
        key: v.key,
        value: JSON.parse(v.value)
      })
    } catch (e) {
      incompatibleSettingsToRemove.push(v._id)
    }
  })

  if (incompatibleSettingsToRemove.length) {
    return documentStore.collection('settings').remove({ _id: { $in: incompatibleSettingsToRemove } })
  }
}

Settings.prototype.registerEntity = function (documentStore) {
  documentStore.registerEntityType('SettingType', {
    key: { type: 'Edm.String' },
    value: { type: 'Edm.String' }
  })

  documentStore.registerEntitySet('settings', { entityType: 'jsreport.SettingType', shared: true })
}

module.exports = Settings
