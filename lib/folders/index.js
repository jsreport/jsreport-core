const resolveFolderFromPath = require('./resolveFolderFromPath')
const extendStoreWithFolders = require('./extendStoreWithFolders')
module.exports = (reporter) => {
  extendStoreWithFolders(reporter)

  return {
    resolveFolderFromPath: resolveFolderFromPath(reporter)
  }
}
