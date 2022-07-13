import { EntityBatch } from "./entity.js";
import { ContentGrouping, ContentItem, PrismaClient } from "./prisma.js"
import type { DataSource } from "./datasource.js";

export async function storeEntityBatchFromDataSource (prisma: PrismaClient, datasource: DataSource, batch: EntityBatch) {
  const datasourceId = datasource.definition.uid
  for (const entity of batch.entities) {
    const revisionId = entity.value.revisionId
    const uid = entity.value.uid
    const type = entity.type
    try {
    // Create revision.
      const _revision = await prisma.revision.create({
        data: {
          type,
          id: revisionId,
          uid,
          datasource: datasourceId,
          created: new Date()
        }
      })

      if (type === 'ContentItem') {
        await prisma.contentItem.create({
          data: entity.value as ContentItem
        })
      }
      if (type === 'ContentGrouping') {
        await prisma.contentGrouping.create({
          data: entity.value as ContentGrouping
        })
      }
      // console.log(`saved ${uid} revision ${revisionId}`)
    } catch (err) {
      // TODO: What to do on errors?
      console.error(`error saving ${uid} revision ${revisionId}: ${err}`)
    }
  }
}

// async function storeEntityUpdate(type: string, content: Entity) {
// }
