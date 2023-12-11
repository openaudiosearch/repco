import { CarWriter } from '@ipld/car'
import { Block, BlockWriter } from '@ipld/car/api.js'
import { CID } from 'multiformats/cid'
import { CommitIpld, RootIpld } from 'repco-common/schema'
import { Prisma } from 'repco-prisma'
import { IpldBlockStore } from './blockstore.js'
import { Repo } from '../repo.js'

export async function exportRepoToCar(
  blockstore: IpldBlockStore,
  head: CID,
  tail?: CID,
) {
  const { writer, out } = CarWriter.create([head])
  writeRepoToCar(blockstore, writer, head, tail)
  return out
}

export async function exportRepoToCarReversed(
  repo: Repo,
  head: CID,
  tail?: CID,
  onProgress?: ExportOnProgressCallback,
) {
  const { writer, out } = CarWriter.create([tail || head])
  writeRepoToCarReversed(repo, writer, head, tail, onProgress)
  return out
}

export type ExportOnProgressCallback = (progress: ExportProgress) => void

export type ExportProgress = {
  commitsTotal: number
  commits: number
  bytes: number
  blocks: number
  deltaBytes: number
}

async function writeRepoToCarReversed(
  repo: Repo,
  writer: BlockWriter,
  head: CID,
  tail?: CID,
  onProgress?: ExportOnProgressCallback,
) {
  try {
    const headRow = await repo.prisma.commit.findFirst({
      where: { repoDid: repo.did, rootCid: head.toString() },
      select: { timestamp: true },
    })
    if (!headRow) throw new Error('Invalid head')
    const where: Prisma.CommitWhereInput[] = [
      { repoDid: repo.did, timestamp: { lte: headRow.timestamp } },
    ]

    if (tail) {
      const tailRow = await repo.prisma.commit.findFirst({
        where: { repoDid: repo.did, rootCid: tail.toString() },
        select: { timestamp: true },
      })
      if (!tailRow) throw new Error('Invalid tail')
      where.push({
        repoDid: repo.did,
        timestamp: { gt: tailRow.timestamp },
      })
    }
    const commitCount = await repo.prisma.commit.count({
      where: { AND: where },
    })
    const commitLog = await repo.prisma.commit.findMany({
      where: { AND: where },
      orderBy: { timestamp: 'asc' },
      select: { rootCid: true },
    })
    const progress = {
      commitsTotal: commitCount,
      commits: 0,
      bytes: 0,
      blocks: 0,
      deltaBytes: 0,
    }
    const trackingWriter = new TrackingBlockWriter(writer)
    for (const commitRow of commitLog) {
      const commit = await writeCommitToCar(
        repo.blockstore,
        trackingWriter,
        CID.parse(commitRow.rootCid),
      )
      if (commit) progress.commits += 1
      progress.bytes = trackingWriter.bytesWritten
      progress.blocks = trackingWriter.blocksWritten
      progress.deltaBytes = trackingWriter.getDelta()
      if (onProgress) onProgress(progress)
    }
  } catch (err) {
    // This runs in the background, streaming,
    // so there is currently nowhere to throw the error to.
    console.error('export failed', err)
  } finally {
    await writer.close()
  }
}

async function writeRepoToCar(
  blockstore: IpldBlockStore,
  writer: BlockWriter,
  head: CID,
  tail?: CID,
) {
  try {
    let cid: CID | null = head
    while (cid) {
      const commit: CommitIpld = await writeCommitToCar(blockstore, writer, cid)
      const parent = commit.headers.Parents[0]
        ? commit.headers.Parents[0]
        : null
      if (!parent || (tail && tail.equals(parent))) {
        cid = null
      } else {
        cid = parent
      }
    }
  } catch (err) {
    // This runs in the background, streaming,
    // so there is currently nowhere to throw the error to.
    console.error('export failed', err)
  } finally {
    await writer.close()
  }
}

async function writeCommitToCar(
  blockstore: IpldBlockStore,
  writer: BlockWriter,
  cid: CID,
): Promise<CommitIpld> {
  const root: RootIpld = await fetchAndPutParsed(blockstore, writer, cid)
  const commit: CommitIpld = await fetchAndPutParsed(
    blockstore,
    writer,
    root.body,
  )
  for (const [cid, bodyCid] of commit.body) {
    await fetchAndPut(blockstore, writer, cid)
    if (bodyCid) await fetchAndPut(blockstore, writer, bodyCid)
  }
  return commit
}

async function fetchAndPut(
  blockstore: IpldBlockStore,
  writer: BlockWriter,
  cid: CID,
): Promise<Uint8Array> {
  const bytes = await blockstore.getBytes(cid)
  await writer.put({ cid, bytes })
  return bytes
}
async function fetchAndPutParsed<T>(
  blockstore: IpldBlockStore,
  writer: BlockWriter,
  cid: CID,
): Promise<T> {
  const bytes = await fetchAndPut(blockstore, writer, cid)
  const data = blockstore.parse(bytes)
  return data as unknown as T
}

class TrackingBlockWriter implements BlockWriter {
  bytesWritten = 0
  blocksWritten = 0
  deltaBytes = 0
  constructor(public inner: BlockWriter) {}
  getDelta() {
    const delta = this.deltaBytes
    this.deltaBytes = 0
    return delta
  }
  put(block: Block): Promise<void> {
    const len = block.bytes.length + block.cid.bytes.length
    this.deltaBytes += len
    this.bytesWritten += len
    this.blocksWritten += 1
    return this.inner.put(block)
  }
  close(): Promise<void> {
    return this.inner.close()
  }
}
