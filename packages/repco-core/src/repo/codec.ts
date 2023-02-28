import * as cbor from 'cbor-x'
import { CID } from 'multiformats/cid'

// https://github.com/ipfs/go-ipfs/issues/3570#issuecomment-273931692
const CID_CBOR_TAG = 42

export const name = 'dag-cbor'
export const code = 0x71

const encoder = new cbor.Encoder({
  useRecords: false,
  mapsAsObjects: true,
})
cbor.addExtension({
  Class: CID,
  tag: CID_CBOR_TAG,
  encode(value, encodeFn) {
    const cid = CID.asCID(value)
    if (!cid) throw new Error('Invalid CID: ' + value)
    const bytes = new Uint8Array(cid.bytes.byteLength + 1)
    bytes.set(cid.bytes, 1) // prefix is 0x00, for historical reasons
    return encodeFn(bytes)
  },
  decode(bytes: Uint8Array) {
    if (bytes[0] !== 0) {
      throw new Error('Invalid CID for CBOR tag 42; expected leading 0x00')
    }
    return CID.decode(bytes.subarray(1)) // ignore leading 0x00
  },
})
export function encode(node: any) {
  return encoder.encode(preEncode(node))
}

export function decode(bytes: Uint8Array) {
  return postDecode(encoder.decode(bytes))
}

const ISO_DATE_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/
const ISO_DATE_LENGTH = 24

type IpldScalar = string | number | CID | boolean | Uint8Array | null
interface IpldRecord {
  [k: string]: IpldValue
}
type IpldArray = IpldValue[]
export type IpldValue = IpldRecord | IpldScalar | IpldArray

function preEncode(value: any): IpldValue {
  const map = (value: any) => {
    if (isNaN(value)) throw new Error('NaN is not permitted in the IPLD data model')
    if (value === Infinity || value === -Infinity) throw new Error('Infinity is not permitted in the IPLD data model')
    if (value instanceof Date) return value.toISOString()
    if (value instanceof CID) return value
    if (value instanceof Uint8Array) return value
    if (value instanceof Buffer) return value
    if (value === undefined || value === null) return null
    return walker(map, value)
  }
  return map(value)
}

function postDecode(value: IpldValue): any {
  const map = (value: any) => {
    if (typeof value === 'string') {
      if (value.length === ISO_DATE_LENGTH && ISO_DATE_REGEX.test(value)) {
        const date = new Date(value)
        if (date.toISOString() === value) return date
      }
    }
    if (value instanceof CID) return value
    if (value instanceof Uint8Array) return value
    if (value instanceof Buffer) return value
    if (value === undefined || value === null) return null
    return walker(map, value)
  }
  return map(value)
}

function walker(map: (value: any) => any, value: any): any {
  if (value instanceof Set) return walker(map, Array.from(value.entries()).sort())
  if (value instanceof Map)
    return walker(map, Object.fromEntries(value.entries()))

  if (Array.isArray(value)) return value.map(map)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([k, v]) => [k, map(v)])
        .sort((a, b) => (a[0] > b[0] ? 1 : -1)),
    )
  }
  return value
}

//
// /**
//  * @template T
//  * @typedef {import('multiformats/codecs/interface').ByteView<T>} ByteView
//  */
//
// /**
//  * cidEncoder will receive all Objects during encode, it needs to filter out
//  * anything that's not a CID and return `null` for that so it's encoded as
//  * normal.
//  *
//  * @param {any} obj
//  * @returns {cborg.Token[]|null}
//  */
// function cidEncoder(obj: any) {
//   if (obj.asCID !== obj && obj['/'] !== obj.bytes) {
//     return null // any other kind of object
//   }
//   const cid = CID.asCID(obj)
//   /* c8 ignore next 4 */
//   // very unlikely case, and it'll probably throw a recursion error in cborg
//   if (!cid) {
//     return null
//   }
//   const bytes = new Uint8Array(cid.bytes.byteLength + 1)
//   bytes.set(cid.bytes, 1) // prefix is 0x00, for historical reasons
//   return [
//     new cborg.Token(cborg.Type.tag, CID_CBOR_TAG),
//     new cborg.Token(cborg.Type.bytes, bytes),
//   ]
// }

// /**
//  * Intercept all `number` values from an object walk and reject the entire
//  * object if we find something that doesn't fit the IPLD data model (NaN &
//  * Infinity).
//  *
//  * @param {number} num
//  * @returns {null}
//  */
// function numberEncoder(num: number) {
//   if (Number.isNaN(num)) {
//     throw new Error(
//       '`NaN` is not supported by the IPLD Data Model and cannot be encoded',
//     )
//   }
//   if (num === Infinity || num === -Infinity) {
//     throw new Error(
//       '`Infinity` and `-Infinity` is not supported by the IPLD Data Model and cannot be encoded',
//     )
//   }
//   return null
// }
