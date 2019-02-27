
const util = require('util')
const path = require('path')
const fs = require('fs')
const mkdirp = require('mkdirp')
const uuidv4 = require('uuid/v4')

const readFileAsync = util.promisify(fs.readFile)
const writeFileAsync = util.promisify(fs.writeFile)

module.exports.readTempFile = async function readTempFile (tempDirectory, filename, opts = {}) {
  const pathToFile = path.join(tempDirectory, filename)

  const content = await readFileAsync(pathToFile, opts)

  return {
    pathToFile,
    filename,
    content
  }
}

module.exports.writeTempFile = async function writeTempFile (tempDirectory, filenameFn, content, opts = {}) {
  const filename = filenameFn(uuidv4())

  if (filename == null || filename === '') {
    throw new Error('No valid filename was returned from filenameFn')
  }

  const pathToFile = path.join(tempDirectory, filename)

  await new Promise((resolve) => {
    mkdirp(tempDirectory, () => {
      resolve()
    })
  })

  await writeFileAsync(pathToFile, content, opts)

  return {
    pathToFile,
    filename
  }
}
