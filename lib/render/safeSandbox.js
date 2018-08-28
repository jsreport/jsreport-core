
const os = require('os')
const util = require('util')
const path = require('path')
const extend = require('node.extend')
const get = require('lodash.get')
const set = require('lodash.set')
const hasOwn = require('has-own-deep')
const unsetValue = require('unset-value')
const groupBy = require('lodash.groupby')
const { VM, VMScript } = require('vm2')
const originalVM = require('vm')
const stackTrace = require('stack-trace')
const { codeFrameColumns } = require('@babel/code-frame')

module.exports = (_sandbox, options = {}) => {
  const {
    timeout,
    errorPrefix,
    formatError,
    propertiesConfig = {},
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

  const propsConfig = normalizePropertiesConfigInHierarchy(propertiesConfig)
  const originalValues = {}
  const contextified = new WeakMap()
  const proxied = new WeakMap()

  // we copy the object based on config to avoid sharing same context
  // (with getters/setters) in the rest of request pipeline when
  // using the in-process strategy
  const sandbox = copyBasedOnPropertiesConfig(_sandbox, propertiesConfig)

  applyPropertiesConfig(sandbox, propsConfig, {
    original: originalValues,
    proxied
  })

  Object.assign(sandbox, {
    console: _console,
    require: _require
  })

  const vm = new VM({
    timeout
  })

  const originalContextifyValue = vm._internal.Contextify.value.bind(vm._internal.Contextify)

  // patching Contextify.value to save the records of all proxies generated in vm
  vm._internal.Contextify.value = (value, ...args) => {
    const result = originalContextifyValue(value, ...args)

    if (
      result != null &&
      (typeof result === 'object' || typeof result === 'function')
    ) {
      contextified.set(result, value)
    }

    return result
  }

  for (let name in sandbox) {
    vm._internal.Contextify.globalValue(sandbox[name], name)
  }

  // processing top level props because getter/setter descriptors
  // for top level properties will only work after VM instantiation
  Object.keys(propsConfig).forEach((key) => {
    const currentConfig = propsConfig[key]

    if (currentConfig.root && currentConfig.root.sandboxReadOnly) {
      readOnlyProp(vm._context, key, [], proxied, { onlyTopLevel: true })
    }
  })

  return {
    sandbox: vm._context,
    console: _console,
    messages,
    contextifyValue: (value) => {
      return vm._internal.Contextify.value(value)
    },
    decontextifyValue: (value) => {
      if (proxied.has(value)) {
        value = proxied.get(value)
      } else {
        value = contextified.has(value) ? contextified.get(value) : value

        if (proxied.has(value)) {
          value = proxied.get(value)
        }
      }

      return value
    },
    restore: () => {
      return restoreProperties(vm._context, originalValues, contextified, proxied)
    },
    run: (code, { filename, mainFilename, mainSource } = {}) => {
      const script = new VMScript(code, filename)
      const prefix = errorPrefix != null ? errorPrefix : 'Error ocurred.'

      // NOTE: if we need to upgrade vm2 we will need to check the source of this function
      // in vm2 repo and see if we need to change this,
      // we needed to override this method because we want "displayErrors" to be true in order
      // to show nice error when the compile of a script fails
      script.compile = function compile () {
        if (this._compiled) return this

        this._compiled = new originalVM.Script(this.code, {
          filename: this.filename,
          displayErrors: true
        })

        return this
      }

      try {
        return vm.run(script)
      } catch (e) {
        decorateErrorMessage(e, {
          prefix,
          mainFilename,
          mainSource
        })

        throw e
      }
    }
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

function decorateErrorMessage (e, { prefix, mainFilename, mainSource } = {}) {
  if (mainFilename != null && mainSource != null) {
    const trace = stackTrace.parse(e)
    let suffix = ''

    for (let i = 0; i < trace.length; i++) {
      const current = trace[i]

      if (
        current.getLineNumber() == null &&
        current.getColumnNumber() == null
      ) {
        continue
      }

      if (
        current.getFileName() === mainFilename &&
        i === 0 && current.getLineNumber() != null
      ) {
        suffix = `Error on line ${current.getLineNumber()}`

        if (current.getColumnNumber() != null) {
          suffix += `:${current.getColumnNumber()}`
        }

        suffix += '.'
      }

      if (
        current.getFileName() === mainFilename &&
        current.getLineNumber() != null
      ) {
        const codeFrame = codeFrameColumns(mainSource, {
          // we don't check if there is column because if it returns empty value then
          // the code frame is still generated normally, just without column mark
          start: { line: current.getLineNumber(), column: current.getColumnNumber() }
        })

        if (codeFrame !== '') {
          suffix += `\n\n${codeFrame}\n\n`
        }

        break
      }
    }

    if (suffix !== '') {
      e.message = `${e.message}. ${suffix}`
    }
  }

  e.message = `${prefix} ${e.message}`
}

function copyBasedOnPropertiesConfig (context, propertiesMap) {
  const copied = []
  const newContext = Object.assign({}, context)

  Object.keys(propertiesMap).sort(sortPropertiesByLevel).forEach((prop) => {
    const parts = prop.split('.')
    const lastPartsIndex = parts.length - 1

    for (let i = 0; i <= lastPartsIndex; i++) {
      let currentContext = newContext
      const propName = parts[i]
      const parentPath = parts.slice(0, i).join('.')
      const fullPropName = parts.slice(0, i + 1).join('.')
      let value

      if (copied.indexOf(fullPropName) !== -1) {
        continue
      }

      if (parentPath !== '') {
        currentContext = get(newContext, parentPath)
      }

      if (currentContext) {
        value = currentContext[propName]

        if (typeof value === 'object') {
          if (value === null) {
            value = null
          } else if (Array.isArray(value)) {
            value = Object.assign([], value)
          } else {
            value = Object.assign({}, value)
          }

          currentContext[propName] = value
          copied.push(fullPropName)
        }
      }
    }
  })

  return newContext
}

function applyPropertiesConfig (context, config, {
  original,
  proxied,
  isRoot = true,
  isGrouped = true,
  onlyReadOnlyTopLevel = false,
  parentOpts,
  prop
} = {}, readOnlyConfigured = []) {
  let isHidden
  let isReadOnly
  let standalonePropertiesHandled = false

  if (isRoot) {
    return Object.keys(config).forEach((key) => {
      applyPropertiesConfig(context, config[key], {
        original,
        proxied,
        prop: key,
        isRoot: false,
        isGrouped: true,
        onlyReadOnlyTopLevel,
        parentOpts
      }, readOnlyConfigured)
    })
  }

  if (parentOpts && parentOpts.sandboxHidden === true) {
    return
  }

  if (isGrouped) {
    isHidden = config.root ? config.root.sandboxHidden === true : false
    isReadOnly = config.root ? config.root.sandboxReadOnly === true : false
  } else {
    isHidden = config ? config.sandboxHidden === true : false
    isReadOnly = config ? config.sandboxReadOnly === true : false
  }

  // saving original value
  if ((isHidden || isReadOnly)) {
    let exists = true
    let newValue

    if (hasOwn(context, prop)) {
      const originalPropValue = get(context, prop)

      if (typeof originalPropValue === 'object' && originalPropValue != null) {
        if (Array.isArray(originalPropValue)) {
          newValue = extend(true, [], originalPropValue)
        } else {
          newValue = extend(true, {}, originalPropValue)
        }
      } else {
        newValue = originalPropValue
      }
    } else {
      exists = false
    }

    original[prop] = {
      exists,
      value: newValue
    }
  }

  if (isHidden) {
    if (parentOpts && parentOpts.sandboxReadOnly === true) {
      // this error is throw as a signal, a condition that should never happen but if it happens
      // it means that there is a configuration hierarchy that we don't support yet
      throw new Error(`Can't configure property "${prop}" as hidden when parent was configured as readOnly`)
    }

    omitProp(context, prop)
  } else if (isReadOnly && parentOpts && parentOpts.sandboxReadOnly !== true) {
    readOnlyProp(context, prop, readOnlyConfigured, proxied, {
      onlyTopLevel: false,
      onBeforeProxy: () => {
        if (isGrouped && config.standalone) {
          Object.keys(config.standalone).forEach((skey) => {
            const sconfig = config.standalone[skey]

            applyPropertiesConfig(context, sconfig, {
              original,
              proxied,
              prop: skey,
              isRoot: false,
              isGrouped: false,
              onlyReadOnlyTopLevel,
              // we pass that parent was not "readOnly" to allow processing
              // hidden properties configurations without error
              parentOpts: { sandboxHidden: isHidden, sandboxReadOnly: false }
            }, readOnlyConfigured)
          })

          standalonePropertiesHandled = true
        }
      }
    })
  }

  if (!isGrouped) {
    return
  }

  // don't process inner config when the value in context is empty
  if (get(context, prop) == null) {
    return
  }

  if (!standalonePropertiesHandled && config.standalone != null) {
    Object.keys(config.standalone).forEach((skey) => {
      const sconfig = config.standalone[skey]

      applyPropertiesConfig(context, sconfig, {
        original,
        proxied,
        prop: skey,
        isRoot: false,
        isGrouped: false,
        onlyReadOnlyTopLevel,
        parentOpts: { sandboxHidden: isHidden, sandboxReadOnly: isReadOnly }
      }, readOnlyConfigured)
    })
  }

  if (config.inner != null) {
    Object.keys(config.inner).forEach((ikey) => {
      const iconfig = config.inner[ikey]

      applyPropertiesConfig(context, iconfig, {
        original,
        proxied,
        prop: ikey,
        isRoot: false,
        isGrouped: true,
        parentOpts: { sandboxHidden: isHidden, sandboxReadOnly: isReadOnly }
      }, readOnlyConfigured)
    })
  }
}

function restoreProperties (context, originalValues, contextified, proxied) {
  const restored = []
  const newContext = Object.assign({}, context)

  Object.keys(originalValues).sort(sortPropertiesByLevel).forEach((prop) => {
    const confValue = originalValues[prop]
    const parts = prop.split('.')
    const lastPartsIndex = parts.length - 1

    for (let i = 0; i <= lastPartsIndex; i++) {
      let currentContext = newContext
      const propName = parts[i]
      const parentPath = parts.slice(0, i).join('.')
      const fullPropName = parts.slice(0, i + 1).join('.')
      let value

      if (restored.indexOf(fullPropName) !== -1) {
        continue
      }

      if (parentPath !== '') {
        currentContext = get(newContext, parentPath)
      }

      if (currentContext) {
        value = currentContext[propName]

        // unwrapping proxies
        if (proxied.has(value)) {
          value = proxied.get(value)
        } else {
          value = contextified.has(value) ? contextified.get(value) : value

          if (proxied.has(value)) {
            value = proxied.get(value)
          }
        }

        if (typeof value === 'object') {
          // we call object assign to be able to get rid of
          // previous properties descriptors (hide/readOnly) configured
          if (value === null) {
            value = null
          } else if (Array.isArray(value)) {
            value = Object.assign([], value)
          } else {
            value = Object.assign({}, value)
          }

          currentContext[propName] = value
          restored.push(fullPropName)
        }

        if (i === lastPartsIndex) {
          if (confValue.exists) {
            currentContext[propName] = confValue.value
          } else {
            delete currentContext[propName]
          }
        }
      }
    }
  })

  return newContext
}

function omitProp (context, prop) {
  // if property has value, then set it to undefined first,
  // unsetValue expects that property has some non empty value to remove the property
  // so we set to "true" to ensure it works for all cases,
  // we use unsetValue instead of lodash.omit because
  // it supports object paths x.y.z and does not copy the object for each call
  if (hasOwn(context, prop)) {
    set(context, prop, true)
    unsetValue(context, prop)
  }
}

function readOnlyProp (context, prop, configured, proxied, { onlyTopLevel = false, onBeforeProxy } = {}) {
  const parts = prop.split('.')
  const lastPartsIndex = parts.length - 1

  const throwError = (fullPropName) => {
    throw new Error(`Can't modify read only property "${fullPropName}" inside sandbox`)
  }

  for (let i = 0; i <= lastPartsIndex; i++) {
    let currentContext = context
    const isTopLevelProp = i === 0
    const propName = parts[i]
    const parentPath = parts.slice(0, i).join('.')
    const fullPropName = parts.slice(0, i + 1).join('.')
    let value

    if (configured.indexOf(fullPropName) !== -1) {
      continue
    }

    if (parentPath !== '') {
      currentContext = get(context, parentPath)
    }

    if (currentContext) {
      value = currentContext[propName]

      if (
        i === lastPartsIndex &&
        typeof value === 'object' &&
        value != null
      ) {
        const valueType = Array.isArray(value) ? 'array' : 'object'
        const rawValue = value

        if (onBeforeProxy) {
          onBeforeProxy()
        }

        value = new Proxy(rawValue, {
          set: (target, prop) => {
            throw new Error(`Can't add or modify property "${prop}" to read only ${valueType} "${fullPropName}" inside sandbox`)
          },
          deleteProperty: (target, prop) => {
            throw new Error(`Can't delete property "${prop}" in read only ${valueType} "${fullPropName}" inside sandbox`)
          }
        })

        proxied.set(value, rawValue)
      }

      // only create the getter/setter wrapper if the property is defined,
      // this prevents getting errors about proxy traps and descriptors differences
      // when calling `JSON.stringify(req.context)` from a script
      if (currentContext.hasOwnProperty(propName)) {
        configured.push(fullPropName)

        Object.defineProperty(currentContext, propName, {
          get: () => value,
          set: () => { throwError(fullPropName) },
          enumerable: true
        })
      }

      if (isTopLevelProp && onlyTopLevel) {
        break
      }
    }
  }
}

function sortPropertiesByLevel (a, b) {
  const parts = a.split('.')
  const parts2 = b.split('.')

  return parts.length - parts2.length
}

function normalizePropertiesConfigInHierarchy (configMap) {
  const configMapKeys = Object.keys(configMap)

  const groupedKeys = groupBy(configMapKeys, (key) => {
    const parts = key.split('.')

    if (parts.length === 1) {
      return ''
    }

    return parts.slice(0, -1).join('.')
  })

  const hierarchy = []
  const hierarchyLevels = {}

  // we sort to ensure that top level properties names are processed first
  Object.keys(groupedKeys).sort(sortPropertiesByLevel).forEach((key) => {
    if (key === '') {
      hierarchy.push('')
      return
    }

    const parts = key.split('.')
    const lastIndexParts = parts.length - 1

    if (parts.length === 1) {
      hierarchy.push(parts[0])
      hierarchyLevels[key] = {}
      return
    }

    for (let i = 0; i < parts.length; i++) {
      const currentKey = parts.slice(0, i + 1).join('.')
      const indexInHierarchy = hierarchy.indexOf(currentKey)
      let parentHierarchy = hierarchyLevels
      // const shouldInsertToplLevel =
      // const shouldInsertInnerLevel = indexInHierarchy !== -1 && (i + 1 === lastIndexParts)

      if (indexInHierarchy === -1 && i === lastIndexParts) {
        let parentExistsInTopLevel = false

        for (let j = 0; j < i; j++) {
          const segmentedKey = parts.slice(0, j + 1).join('.')

          if (parentExistsInTopLevel !== true) {
            parentExistsInTopLevel = hierarchy.indexOf(segmentedKey) !== -1
          }

          if (parentHierarchy[segmentedKey] != null) {
            parentHierarchy = parentHierarchy[segmentedKey]
          }
        }

        if (!parentExistsInTopLevel) {
          hierarchy.push(key)
        }

        parentHierarchy[key] = {}
      }
    }
  })

  const toHierarchyConfigMap = (parentLevels) => {
    return (acu, key) => {
      if (key === '') {
        groupedKeys[key].forEach((g) => {
          acu[g] = {}

          if (configMap[g] != null) {
            acu[g].root = configMap[g]
          }
        })

        return acu
      }

      const currentLevel = parentLevels[key]

      if (acu[key] == null) {
        acu[key] = {}

        if (configMap[key] != null) {
          // root is config that was defined in the same property
          // that it is grouped
          acu[key].root = configMap[key]
        }
      }

      // standalone are properties that are direct, no groups
      acu[key].standalone = groupedKeys[key].reduce((obj, stdProp) => {
        // only add the property is not already grouped
        if (groupedKeys[stdProp] == null) {
          obj[stdProp] = configMap[stdProp]
        }

        return obj
      }, {})

      if (Object.keys(acu[key].standalone).length === 0) {
        delete acu[key].standalone
      }

      const levelKeys = Object.keys(currentLevel)

      if (levelKeys.length === 0) {
        return acu
      }

      // inner are properties which contains other properties, groups
      acu[key].inner = levelKeys.reduce(toHierarchyConfigMap(currentLevel), {})

      if (Object.keys(acu[key].inner).length === 0) {
        delete acu[key].inner
      }

      return acu
    }
  }

  return hierarchy.reduce(toHierarchyConfigMap(hierarchyLevels), {})
}
