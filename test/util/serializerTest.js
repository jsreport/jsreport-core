const should = require('should')
const createSerializer = require('../../lib/util/serializer')

describe('Serializer', () => {
  let serializer

  beforeEach(async () => {
    serializer = createSerializer()
  })

  it('should serialize basic types', () => {
    const input = {
      x: true,
      num: 5,
      str: 'some value',
      arr: [1, 2, 3],
      obj: { a: true, b: true },
      empty: '',
      emptyNum: 0
    }

    const output = serializer.deserialize(serializer.serialize(input))

    should(output).be.eql(input)
  })

  it('should serialize dates', () => {
    const input = {
      str: 'some value',
      startDate: new Date(2018, 6, 1),
      endDate: new Date(2018, 7, 15)
    }

    const output = serializer.deserialize(serializer.serialize(input))

    should(input.str).be.eql(output.str)
    should(output.startDate.getTime()).be.eql(input.startDate.getTime())
    should(output.endDate.getTime()).be.eql(input.endDate.getTime())
  })

  it('should serialize functions properties to non existent properties', () => {
    const input = {
      a: true,
      x: function (a) { return a }
    }

    const output = serializer.deserialize(serializer.serialize(input))

    should(input.a).be.eql(output.a)
    should(output).not.have.ownProperty('x')
  })

  it('should serialize undefined properties to non existent properties', () => {
    const input = {
      a: undefined,
      b: undefined,
      c: true
    }

    const output = serializer.deserialize(serializer.serialize(input))

    should(input.c).be.eql(output.c)
    should(output).not.have.ownProperty('a')
    should(output).not.have.ownProperty('b')
  })

  it('should serialize undefined items in array as null', () => {
    const input = {
      a: [1, 2, undefined, 4],
      b: true
    }

    const output = serializer.deserialize(serializer.serialize(input))

    should(input.b).be.eql(output.b)
    should(output.a).be.eql([1, 2, null, 4])
  })
})
