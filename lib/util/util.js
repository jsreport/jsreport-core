/*!
 * Copyright(c) 2014 Jan Blaha
 *
 */

var fs = require('fs')
var path = require('path')

/**
 * Recursively deletes files in folder
 */
var deleteFiles = exports.deleteFiles = function (path) {
  try {
    var files = fs.readdirSync(path)

    if (files.length > 0) {
      for (var i = 0; i < files.length; i++) {
        var filePath = path + '/' + files[i]
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath)
        } else {
          deleteFiles(filePath)
        }
      }
    }
    fs.rmdirSync(path)
  } catch (e) {
    return
  }
}

exports.walkSync = function (rootPath, fileName, exclude) {
  var results = []
  var queue = []
  var next = rootPath

  function dirname (f) {
    var parts = path.dirname(f).split(path.sep)
    return parts[parts.length - 1]
  }

  while (next) {
    var list
    try {
      list = fs.readdirSync(next)
    } catch (e) {

    }
    list.forEach(function (i) {
      var item = path.join(next, i)

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
        var extensionsDirectoryName = dirname(item)
        var alreadyListedConfig = results.filter(function (f) {
          return extensionsDirectoryName === dirname(f)
        })

        if (!alreadyListedConfig.length) {
          results.push(item)
        }
      }
    })
    next = queue.shift()
  }

  return results
}
