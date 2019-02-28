
const util = require('util')
const path = require('path')
const fs = require('fs')
const mkdirp = require('mkdirp')
const uuidv4 = require('uuid/v4')

const readFileAsync = util.promisify(fs.readFile)
const writeFileAsync = util.promisify(fs.writeFile)

module.exports.ensureTempDirectoryExists = async function (tempDirectory) {
  return new Promise((resolve) => {
    mkdirp(tempDirectory, () => {
      resolve({
        directoryPath: tempDirectory
      })
    })
  })
}

module.exports.readTempFile = async function readTempFile (tempDirectory, filename, opts = {}) {
  const pathToFile = path.join(tempDirectory, filename)

  const content = await readFileAsync(pathToFile, opts)

  return {
    pathToFile,
    filename,
    content
  }
}

module.exports.readTempFileStream = async function readTempFileStream (tempDirectory, filename, opts = {}) {
  const pathToFile = path.join(tempDirectory, filename)

  return new Promise((resolve) => {
    const stream = fs.createReadStream(pathToFile, opts)

    resolve({
      pathToFile,
      filename,
      stream
    })
  })
}

module.exports.writeTempFile = async function writeTempFile (tempDirectory, filenameFn, content, opts = {}) {
  return writeFile(tempDirectory, filenameFn, content, opts)
}

module.exports.writeTempFileStream = async function writeTempFileStream (tempDirectory, filenameFn, opts = {}) {
  return writeFile(tempDirectory, filenameFn, undefined, opts, true)
}

async function writeFile (tempDirectory, filenameFn, content, opts, asStream = false) {
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

  if (asStream === true) {
    return new Promise((resolve) => {
      const stream = fs.createWriteStream(pathToFile, opts)

      resolve({
        pathToFile,
        filename,
        stream
      })
    })
  } else {
    await writeFileAsync(pathToFile, content, opts)

    return {
      pathToFile,
      filename
    }
  }
}
