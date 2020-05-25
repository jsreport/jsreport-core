const url = require('url')

module.exports = function normalizeEntityPath (entityPath, req) {
  let parentPath = '/'

  if (req && req.context.currentFolderPath) {
    // url.resolve needs path to end with /
    // url.resolve('/one/two/three', 'four');  // '/one/two/four'
    // url.resolve('/one/two/three/', 'four');  // '/one/two/three/four'
    parentPath = req.context.currentFolderPath.endsWith('/') ? req.context.currentFolderPath : req.context.currentFolderPath + '/'
  }

  return url.resolve(parentPath, entityPath)
}
