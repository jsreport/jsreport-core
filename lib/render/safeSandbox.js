
const os = require('os')
const util = require('util')
const path = require('path')
const { VM } = require('vm2')

module.exports = (sandbox, options = {}) => {
  const {
    timeout,
    formatError,
    allowedModules = [],
    requireMap,
    requirePaths = []
  } = options

  const messages = []
  const _console = {}

  function addConsoleMethod (consoleMethod, level) {
    _console[consoleMethod] = function () {
      messages.push({
        timestamp: new Date().getTime(),
        level: level,
        message: util.format.apply(util, arguments)
      })
    }
  }

  addConsoleMethod('log', 'debug')
  addConsoleMethod('warn', 'warn')
  addConsoleMethod('error', 'error')

  const _require = function (moduleName) {
    if (requireMap) {
      const mapResult = requireMap(moduleName)

      if (mapResult != null) {
        return mapResult
      }
    }

    if (allowedModules === '*') {
      return doRequire(moduleName, requirePaths)
    }

    const m = allowedModules.find(mod => (mod.id || mod) === moduleName)

    if (m) {
      return doRequire(m.path || moduleName, requirePaths)
    }

    const error = new Error(
      `require of "${moduleName}" module has been blocked.`
    )

    if (formatError) {
      formatError(error, moduleName)
    }

    throw error
  }

  const vm = new VM({
    timeout,
    sandbox: {
      ...sandbox,
      console: _console,
      require: _require
    }
  })

  return {
    sandbox: vm._context,
    console: _console,
    messages,
    extendSandbox: (newSandbox = {}) => {
      for (let name in newSandbox) {
        vm._internal.Contextify.globalValue(newSandbox[name], name)
      }

      return vm._context
    },
    run: vm.run.bind(vm)
  }
}

module.exports.requireWithPaths = doRequire

function doRequire (moduleName, requirePaths = []) {
  let searchedPaths = ''

  function safeRequire (require, path) {
    try {
      return require(path)
    } catch (e) {
      searchedPaths += path + os.EOL
      return false
    }
  }

  let result = (
    require.main ? safeRequire(require.main.require, moduleName, searchedPaths) : false
  ) || safeRequire(require, moduleName, searchedPaths)

  if (!result) {
    let pathsSearched = 0

    while (!result && pathsSearched < requirePaths.length) {
      result = safeRequire(require, path.join(requirePaths[pathsSearched], moduleName), searchedPaths)
      pathsSearched++
    }
  }

  if (!result) {
    throw new Error(`Unable to find module ${moduleName}${os.EOL}Searched paths: ${os.EOL}${searchedPaths}`)
  }

  return result
}
