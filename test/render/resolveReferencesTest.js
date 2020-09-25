const resolveReferences = require('../../lib/render/resolveReferences')
require('should')

describe('resolveReferences', () => {
  it('should work with $ref schema and array with primitive', () => {
    resolveReferences({
      $id: '1',
      foo: [1, 2, 3]
    }).should.be.eql({ foo: [1, 2, 3] })
  })
})
