module.exports = async (reporter) => {
  if (reporter.options.migrateEntitySetsToFolders === false) {
    return
  }

  const migrated = await reporter.settings.findValue('core-migrated-folders')

  if (migrated) {
    return
  }
  const folders = await reporter.documentStore.collection('folders').find({})

  if (folders.length > 0) {
    return reporter.settings.addOrSet('core-migrated-folders', true)
  }

  for (const es in reporter.documentStore.model.entitySets) {
    if (!reporter.documentStore.model.entitySets[es].splitIntoDirectories) {
      continue
    }

    if (es === 'folders') {
      continue
    }

    const esEntities = await reporter.documentStore.collection(es).find({})

    if (esEntities.length === 0) {
      return
    }

    const esFolder = await reporter.documentStore.collection('folders').insert({
      name: es
    })

    for (const e of esEntities) {
      await reporter.documentStore.collection(es).update({
        _id: e._id
      }, {
        $set: {
          folder: { shortid: esFolder.shortid }
        }
      })
    }
  }

  return reporter.settings.addOrSet('core-migrated-folders', true)
}
