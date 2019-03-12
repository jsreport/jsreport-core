const url = require('url')

module.exports = (reporter) => async (entityPath, req) => {
  let parentPath = '/'

  if (req && req.context.currentFolderPath) {
    // url.resolve needs path to end with /
    // url.resolve('/one/two/three', 'four');  // '/one/two/four'
    // url.resolve('/one/two/three/', 'four');  // '/one/two/three/four'
    parentPath = req.context.currentFolderPath.endsWith('/') ? req.context.currentFolderPath : req.context.currentFolderPath + '/'
  }

  entityPath = url.resolve(parentPath, entityPath)

  const fragments = entityPath.split('/').filter(s => s)
  let found = false
  let currentFolder = null

  for (const f of fragments) {
    if (found) {
      currentFolder = null
      break
    }

    const folder = await reporter.documentStore.collection('folders').findOne({
      name: decodeURIComponent(f),
      ...(currentFolder && { folder: { shortid: currentFolder.shortid } })
    }, req)

    if (!folder) {
      found = true
      // we don't know from path /a/b if b is template or folder,
      // so if folder is not found, we assume it was other entity and continue
      continue
    }

    currentFolder = folder
  }

  return currentFolder
}
