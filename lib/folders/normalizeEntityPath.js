const path = require('path')

module.exports = function normalizeEntityPath (entityPath, req) {
  let parentPath = '/'

  if (req && req.context.currentFolderPath) {
    parentPath = req.context.currentFolderPath
  }

  return path.join(parentPath, entityPath).replace(/\\/g, '/')
}
