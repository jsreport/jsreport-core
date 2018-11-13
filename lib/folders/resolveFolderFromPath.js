const url = require('url')

module.exports = (reporter) => async (entityPath, req) => {
  if (!entityPath.startsWith('/') && req && req.context.currentFolderPath) {
    // url.resolve needs path to end with /
    // url.resolve('/one/two/three', 'four');  // '/one/two/four'
    // url.resolve('/one/two/three/', 'four');  // '/one/two/three/four'
    entityPath = url.resolve(req.context.currentFolderPath.endsWith('/') ? req.context.currentFolderPath : req.context.currentFolderPath + '/', entityPath)
  }

  const fragments = entityPath.split('/').filter(s => s)
  let currentFolder = null

  for (const f of fragments) {
    const folder = await reporter.documentStore.collection('folders').findOne({
      name: f,
      ...(currentFolder && { folder: { shortid: currentFolder.shortid } })
    }, req)

    if (!folder) {
      // we don't know from path /a/b if b is template or folder,
      // so if folder is not found, we assume it was other entity and cotninue
      continue
    }

    currentFolder = folder
  }

  return currentFolder
}
