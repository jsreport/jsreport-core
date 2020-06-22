
function getType (model, container, typeName, returnNormalizedTypeName) {
  const normalizedTypeName = typeName.replace(model.namespace + '.', '')
  const typeInfo = container[normalizedTypeName]

  if (!typeInfo) {
    return
  }

  if (returnNormalizedTypeName === true) {
    return normalizedTypeName
  }

  return typeInfo
}

function resolvePropDefinition (model, def) {
  const result = {}
  const collectionTypeRegExp = /^Collection\((\S+)\)$/
  const collectionMatchResult = collectionTypeRegExp.exec(def.type)

  if (def.type.startsWith('Edm')) {
    result.def = def
  } else if (collectionMatchResult != null && collectionMatchResult[1] != null) {
    const childType = collectionMatchResult[1]

    if (childType.startsWith('Edm')) {
      result.def = def
      result.subDef = { type: childType }
    } else {
      const subType = getType(model, model.complexTypes, childType)

      if (subType != null) {
        result.def = def
        result.subType = subType
      }
    }
  } else {
    const subType = getType(model, model.complexTypes, def.type)

    if (subType) {
      result.def = def
      result.subType = subType
    }
  }

  if (Object.keys(result).length === 0) {
    return
  }

  return result
}

module.exports.getType = getType
module.exports.resolvePropDefinition = resolvePropDefinition
