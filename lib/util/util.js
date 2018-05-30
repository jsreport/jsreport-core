/*!
 * Copyright(c) 2014 Jan Blaha
 *
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

/**
 * Recursively deletes files in folder
 */
const deleteFiles = exports.deleteFiles = (path) => {
  try {
    fs.readdirSync(path).forEach((f) => {
      const filePath = path + '/' + f
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath)
      } else {
        deleteFiles(filePath)
      }
    })
    fs.rmdirSync(path)
  } catch (e) {

  }
}

exports.walkSync = (rootPath, fileName, exclude) => {
  const results = []
  const queue = []
  let next = rootPath

  function dirname (f) {
    const parts = path.dirname(f).split(path.sep)
    return parts[parts.length - 1]
  }

  while (next) {
    let list
    try {
      list = fs.readdirSync(next)
    } catch (e) {
      // no permissions to read folder for example, just skip it
      list = []
    }
    list.forEach((i) => {
      const item = path.join(next, i)

      if (item.indexOf(exclude) > -1) {
        return
      }

      try {
        if (fs.statSync(item).isDirectory()) {
          queue.push(item)
          return
        }
      } catch (e) {

      }

      if (i === fileName) {
        const extensionsDirectoryName = dirname(item)
        const alreadyListedConfig = results.filter((f) => extensionsDirectoryName === dirname(f))

        if (!alreadyListedConfig.length) {
          results.push(item)
        }
      }
    })
    next = queue.shift()
  }

  return results
}

module.exports.uid = (len) => crypto.randomBytes(Math.ceil(Math.max(8, len * 2)))
  .toString('base64')
  .replace(/[+/]/g, '')
  .slice(0, len)
